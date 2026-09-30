"""SQLite 异地备份服务（openspec: sqlite-backup-dr）。

权威设计：docs/design/sqlite-backup-dr.md + openspec/changes/sqlite-backup-dr/design.md

关键纪律（约定 #29）：备份全程不持有任何数据库事务——外部 IO（VACUUM/tar/SSH）
前后用短会话写历史/状态并立即 commit，避免 SQLite 写锁横跨网络操作。

密码安全：与 ansible_service 相同，密码经 ``sshpass -e`` + 环境变量传递，
不出现在 argv。区别于 ansible_service 在构建期写 os.environ 的做法，这里把
env 显式传给子进程（无跨请求串值竞态）。
"""

from __future__ import annotations

import asyncio
import contextlib
import hashlib
import json
import logging
import os
import re
import shlex
import sqlite3
import subprocess
import tarfile
import tempfile
import threading
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING, Optional
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.core import db_config
from app.services.ansible_service import _sshpass_available

if TYPE_CHECKING:  # pragma: no cover
    from app.models.db_backup import DbBackupConfig

# ── 常量 ────────────────────────────────────────────────────────────────────

PACKAGE_RE = re.compile(r"^panshi_backup_\d{8}_\d{6}\.tar\.gz$")
META_FORMAT_VERSION = 1
SHANGHAI = ZoneInfo("Asia/Shanghai")

# 备份/恢复互斥（同一时刻只允许一个备份或恢复在跑）
_INFLIGHT_LOCK = threading.Lock()

logger = logging.getLogger("app.db_backup")


def try_acquire_inflight() -> bool:
    return _INFLIGHT_LOCK.acquire(blocking=False)


def release_inflight() -> None:
    if _INFLIGHT_LOCK.locked():
        _INFLIGHT_LOCK.release()


def inflight_busy() -> bool:
    return _INFLIGHT_LOCK.locked()


def _backend_root() -> Path:
    """app/services/db_backup_service.py → backend/。"""
    return Path(__file__).resolve().parents[2]


def resolve_db_path(p: str) -> Path:
    """注册表里的相对路径（./data/x.db）统一按 backend/ 解析，不依赖 cwd。"""
    path = Path(p)
    if path.is_absolute():
        return path
    return _backend_root() / path


def _utcnow() -> datetime:
    return datetime.utcnow()


# ── 注册表枚举与快照 ────────────────────────────────────────────────────────


def collect_sqlite_connections(cfg: db_config.DbConfig) -> tuple[list, list]:
    """返回 (sqlite 连接列表, 被跳过的连接 id 列表)。

    跳过 = 非 sqlite 类型（PG 库的 DR 走数据库自身机制，见 design 决策）。
    """
    conns = [c for c in cfg.connections if c.type == "sqlite"]
    skipped = [c.id for c in cfg.connections if c.type != "sqlite"]
    return conns, skipped


def snapshot_sqlite_databases(conns: list, active_id: str, workdir: str) -> tuple[list, list]:
    """逐库 ``VACUUM INTO`` 快照。

    - 活动库文件缺失 → RuntimeError（活动库是核心数据，缺失即中止）
    - 非活动库缺失/不可读 → 记入 skipped，继续
    """
    os.makedirs(workdir, exist_ok=True)
    snapshots: list[dict] = []
    skipped: list[dict] = []
    for conn in conns:
        src = resolve_db_path(conn.path or "")
        dst = Path(workdir) / f"{conn.id}.db"
        if conn.id == active_id and not src.exists():
            raise RuntimeError(f"活动数据库文件不存在: {src}（active={active_id}）")
        if not src.exists() or not os.access(src, os.R_OK):
            skipped.append({"conn_id": conn.id, "path": conn.path, "reason": "文件缺失或不可读"})
            continue
        try:
            _vacuum_into(src, dst)
        except sqlite3.Error as exc:  # pragma: no cover - 损坏库
            if conn.id == active_id:
                raise RuntimeError(f"活动数据库快照失败: {exc}") from exc
            skipped.append({"conn_id": conn.id, "path": conn.path, "reason": f"快照失败: {exc}"})
            continue
        snapshots.append({"conn_id": conn.id, "source": str(src), "snapshot": str(dst)})
    return snapshots, skipped


def _vacuum_into(src: Path, dst: Path) -> None:
    """SQLite ≥3.27 VACUUM INTO：在线一致快照，无需停写。"""
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        dst.unlink()
    conn = sqlite3.connect(f"file:{src}?mode=ro", uri=True)
    try:
        try:
            conn.execute("VACUUM main INTO ?", (str(dst),))
        except sqlite3.OperationalError:
            # 个别构建不接受绑定参数，回退字面量（转义单引号）
            quoted = "'" + str(dst).replace("'", "''") + "'"
            conn.execute(f"VACUUM main INTO {quoted}")
    finally:
        conn.close()


# ── 版本标识 ────────────────────────────────────────────────────────────────


def _app_version_info() -> dict:
    """pyproject 版本 + git 短哈希（best-effort，无 .git 时为 None）。"""
    version = "unknown"
    try:
        import tomllib

        pyproject = _backend_root() / "pyproject.toml"
        if pyproject.exists():
            with pyproject.open("rb") as f:
                data = tomllib.load(f)
            version = data.get("project", {}).get("version") or "unknown"
    except Exception:  # pragma: no cover
        pass
    commit: Optional[str] = None
    try:
        out = subprocess.run(
            ["git", "-C", str(_backend_root()), "rev-parse", "--short", "HEAD"],
            capture_output=True, text=True, timeout=10,
        )
        if out.returncode == 0:
            commit = out.stdout.strip()
    except Exception:  # pragma: no cover
        pass
    return {"app_version": version, "git_commit": commit}


# ── 打包 ────────────────────────────────────────────────────────────────────


def _package_name(now_shanghai: datetime) -> str:
    return f"panshi_backup_{now_shanghai:%Y%m%d_%H%M%S}.tar.gz"


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _add_file(tf: tarfile.TarFile, src: Path, arcname: str, files_meta: dict) -> bool:
    if not src.is_file():
        return False
    tf.add(str(src), arcname=arcname)
    files_meta[arcname] = {"size": src.stat().st_size, "sha256": _sha256(src)}
    return True


def _add_dir(tf: tarfile.TarFile, src: Path, arcname: str, files_meta: dict) -> bool:
    if not src.is_dir():
        return False
    for p in sorted(src.rglob("*")):
        if p.is_file():
            rel = p.relative_to(src).as_posix()
            tf.add(str(p), arcname=f"{arcname}/{rel}")
            files_meta[f"{arcname}/{rel}"] = {"size": p.stat().st_size, "sha256": _sha256(p)}
    return True


def build_package(
    workdir: str,
    snapshots: list[dict],
    skipped: list,
    includes: dict,
    version_info: dict,
    meta: dict,
) -> tuple[str, dict]:
    """把快照 + 配置/密钥/清单/数据段打成 tar.gz。

    返回 (包绝对路径, 最终 meta dict)。meta['files'] 在此填充完整清单。
    """
    root = _backend_root()
    now_shanghai = datetime.now(SHANGHAI)
    name = _package_name(now_shanghai)
    pkg_path = str(Path(workdir) / name)

    meta.setdefault("format_version", META_FORMAT_VERSION)
    meta["app_version"] = version_info.get("app_version")
    meta["git_commit"] = version_info.get("git_commit")
    meta["created_utc"] = _utcnow().isoformat()
    meta["created_local"] = f"{now_shanghai.isoformat()} (Asia/Shanghai)"
    meta["includes"] = {
        "static": bool(includes.get("static")),
        "task_scripts": bool(includes.get("task_scripts")),
        "task_logs": bool(includes.get("task_logs")),
    }
    meta["skipped_databases"] = [s.get("conn_id") for s in skipped]

    files_meta: dict = meta.setdefault("files", {})

    with tarfile.open(pkg_path, "w:gz") as tf:
        # databases/
        for snap in snapshots:
            arc = f"databases/{snap['conn_id']}.db"
            _add_file(tf, Path(snap["snapshot"]), arc, files_meta)
            entry = meta["databases"].setdefault(
                snap["conn_id"], {"original_path": snap.get("source")}
            )
            entry["archive"] = arc

        # config/：平台配置 + 密钥 + 环境文件
        _add_file(tf, root / "db_config.json", "config/db_config.json", files_meta)
        for yaml_name in ("features.yaml", "clickhouse.yaml"):
            _add_file(tf, root / "app" / "config" / yaml_name, f"config/{yaml_name}", files_meta)
        _add_file(tf, root / "data" / ".jwt_secret", "config/.jwt_secret", files_meta)
        for env in sorted((root).glob(".env.*")):
            if env.is_file():
                _add_file(tf, env, f"config/{env.name}", files_meta)

        # ansible/：主机清单与组变量（恢复节点自动化能力所需）
        _add_file(tf, root / "ansible" / "inventory" / "host", "ansible/inventory/host", files_meta)
        _add_dir(tf, root / "ansible" / "inventory" / "backups", "ansible/inventory/backups", files_meta)
        _add_dir(tf, root / "ansible" / "group_vars", "ansible/group_vars", files_meta)

        # data/：B 类段按开关
        if includes.get("static"):
            _add_dir(tf, root / "data" / "static", "data/static", files_meta)
        if includes.get("task_scripts"):
            _add_dir(tf, root / "data" / "task-scripts", "data/task-scripts", files_meta)
        if includes.get("task_logs"):
            _add_dir(tf, root / "data" / "task-logs", "data/task-logs", files_meta)

        # meta.json 最后写入（含 files 清单）
        meta_buf = json.dumps(meta, ensure_ascii=False, indent=2).encode("utf-8")
        info = tarfile.TarInfo("meta.json")
        info.size = len(meta_buf)
        import io as _io

        tf.addfile(info, _io.BytesIO(meta_buf))

    return pkg_path, meta


# ── SSH/SCP 传输 ────────────────────────────────────────────────────────────

_SSH_BASE_OPTS = [
    "-o", "ConnectTimeout=15",
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
]


def _require_sshpass(password: Optional[str]) -> None:
    if password and not _sshpass_available():
        raise RuntimeError("未安装 sshpass，无法使用密码认证（sudo apt-get install sshpass）")


def _ssh_argv(target: dict, remote_cmd: str, password: Optional[str], key_path: Optional[str] = None):
    """构建 ssh 命令。密码经 SSHPASS 环境变量传递（调用方合并 env）。"""
    base = [*_SSH_BASE_OPTS]
    port = int(target.get("port") or 22)
    if port != 22:
        base += ["-p", str(port)]
    if password:
        _require_sshpass(password)
        argv = ["sshpass", "-e", "ssh", *base, f"{target['username']}@{target['host']}", remote_cmd]
        env = {**os.environ, "SSHPASS": password}
        return argv, env
    argv = ["ssh", *_ssh_base_for_key(key_path), *base, f"{target['username']}@{target['host']}", remote_cmd]
    return argv, dict(os.environ)


def _ssh_base_for_key(key_path: Optional[str]):
    if key_path:
        return ["-i", str(key_path), "-o", "BatchMode=yes"]
    return ["-o", "BatchMode=yes"]


def _scp_argv(target: dict, local: str, remote: str, password: Optional[str], key_path: Optional[str] = None):
    base = [*_SSH_BASE_OPTS]
    port = int(target.get("port") or 22)
    if port != 22:
        base += ["-P", str(port)]
    else:
        base += ["-P", "22"]
    if password:
        _require_sshpass(password)
        argv = ["sshpass", "-e", "scp", *base, local, f"{target['username']}@{target['host']}:{remote}"]
        env = {**os.environ, "SSHPASS": password}
        return argv, env
    key_opts = _ssh_base_for_key(key_path)
    argv = ["scp", *key_opts, *base, local, f"{target['username']}@{target['host']}:{remote}"]
    return argv, dict(os.environ)


async def _run(cmd: list[str], env: dict | None = None, timeout: int = 300) -> tuple[int, str, str]:
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.communicate()
        raise RuntimeError(f"远程命令超时（{timeout}s）: {' '.join(cmd[:3])} …")
    rc = proc.returncode or 0
    return rc, stdout.decode("utf-8", errors="replace").strip(), stderr.decode("utf-8", errors="replace").strip()


async def _remote_exec(target: dict, remote_cmd: str, password: Optional[str],
                       key_path: Optional[str] = None, timeout: int = 60) -> str:
    argv, env = _ssh_argv(target, remote_cmd, password, key_path)
    rc, out, err = await _run(argv, env=env, timeout=timeout)
    if rc != 0:
        raise RuntimeError(f"远程命令失败（rc={rc}）: {err or out}")
    return out


async def ensure_remote_dir(target: dict, remote_dir: str, password: Optional[str], key_path: Optional[str] = None) -> None:
    await _remote_exec(target, f"mkdir -p {shlex.quote(remote_dir)}", password, key_path)


async def push_package(target: dict, local_path: str, remote_dir: str, package_name: str,
                       password: Optional[str] = None, key_path: Optional[str] = None) -> None:
    """上传：先落 .part 再 mv，远端不会出现半写包。"""
    remote_dir_q = shlex.quote(remote_dir)
    part = f"{remote_dir_q}/{shlex.quote(package_name)}.part"
    final = f"{remote_dir_q}/{shlex.quote(package_name)}"
    argv, env = _scp_argv(target, local_path, part, password, key_path)
    rc, out, err = await _run(argv, env=env, timeout=600)
    if rc != 0:
        raise RuntimeError(f"备份包上传失败: {err or out}")
    await _remote_exec(target, f"mv {part} {final}", password, key_path)


async def list_remote_packages(target: dict, remote_dir: str,
                               password: Optional[str] = None, key_path: Optional[str] = None) -> list[dict]:
    """远端包列表（名称白名单过滤 + mtime + size）。"""
    out = await _remote_exec(
        target,
        f"cd {shlex.quote(remote_dir)} 2>/dev/null && ls -1 --time-style=+%s -l 2>/dev/null | "
        "awk '{print $6, $7}' 2>/dev/null || true",
        password, key_path,
    )
    packages = []
    for line in out.splitlines():
        parts = line.split()
        if len(parts) != 2:
            continue
        ts, name = parts
        if not PACKAGE_RE.match(name):
            continue
        packages.append({"name": name, "mtime_epoch": int(ts)})
    packages.sort(key=lambda p: p["name"], reverse=True)
    return packages


async def cleanup_retention(target: dict, remote_dir: str, retain_count: int,
                            password: Optional[str] = None, key_path: Optional[str] = None) -> list[str]:
    """保留最近 retain_count 份，删更旧的。只动白名单内的包名。"""
    out = await _remote_exec(target, f"ls -1 {shlex.quote(remote_dir)} 2>/dev/null || true", password, key_path)
    names = sorted(
        (n for n in out.splitlines() if PACKAGE_RE.match(n.strip())),
        reverse=True,
    )
    to_remove = names[retain_count:]
    if to_remove:
        quoted = " ".join(shlex.quote(n) for n in to_remove)
        await _remote_exec(
            target,
            f"cd {shlex.quote(remote_dir)} && rm -f {quoted}",
            password, key_path,
        )
    return to_remove


# ── 配置行 ──────────────────────────────────────────────────────────────────


async def get_config_row(db) -> "DbBackupConfig":
    """取配置行（无则建默认行 id=1）。"""
    from app.models.db_backup import DbBackupConfig

    row = await db.get(DbBackupConfig, 1)
    if row is None:
        row = DbBackupConfig(id=1)
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


def config_target(row) -> tuple[dict, Optional[str], Optional[str]]:
    """从配置行提取 (target dict, password, key_path)。"""
    password = None
    if row.auth_type == "password" and row.password_encrypted:
        try:
            password = db_config.decrypt_password(row.password_encrypted)
        except Exception:
            password = None
    return (
        {
            "host": row.host,
            "port": row.port,
            "username": row.username,
            "auth_type": row.auth_type,
        },
        password,
        row.key_path if row.auth_type == "key" else None,
    )


def config_complete(row) -> tuple[bool, Optional[str]]:
    if not row.host or not row.username or not row.remote_dir:
        return False, "主机 / 用户名 / 远端目录未配置完整"
    if row.auth_type == "password" and not row.password_encrypted:
        return False, "密码认证未设置密码"
    if row.auth_type == "key" and not row.key_path:
        return False, "密钥认证未设置私钥路径"
    return True, None


def sqlite_applicable() -> bool:
    cfg = db_config.load_config()
    conns, _ = collect_sqlite_connections(cfg)
    return len(conns) > 0


# ── 备份编排 ────────────────────────────────────────────────────────────────


async def perform_backup(trigger: str, db=None) -> dict:
    """完整备份流程：快照 → 打包 → 推送 → 保留清理 → 历史。

    约定 #29：外部 IO 期间不持有数据库事务——三段式短会话。
    备份/恢复共用 in-flight 互斥：进行中再次触发直接拒绝。
    db：端点调用时贯穿请求会话（写历史/回写状态）；调度器不传（自建短会话）。
    """
    if not try_acquire_inflight():
        raise RuntimeError("已有备份/恢复任务进行中，请稍后再试")
    try:
        return await _perform_backup_locked(trigger, db=db)
    finally:
        release_inflight()


async def _perform_backup_locked(trigger: str, db=None) -> dict:
    from app.core.database import AsyncSessionLocal
    from app.models.db_backup import DbBackupConfig, DbBackupHistory

    started = _utcnow()
    history_id: Optional[int] = None

    @contextlib.asynccontextmanager
    async def _session_or(db_arg):
        if db_arg is not None:
            yield db_arg
        else:
            async with AsyncSessionLocal() as s:
                yield s

    # ── 第一段：读配置 + 落历史骨架（commit 后不再持有事务）──
    async with _session_or(db) as session:
        row = await get_config_row(session)
        complete, reason = config_complete(row)
        if not complete:
            raise RuntimeError(f"备份配置不完整：{reason}")
        target, password, key_path = config_target(row)
        includes = {
            "static": bool(row.include_static),
            "task_scripts": bool(row.include_task_scripts),
            "task_logs": bool(row.include_task_logs),
        }
        retain_count = row.retain_count
        remote_dir = row.remote_dir
        history = DbBackupHistory(started_at=started, status="running", trigger=trigger)
        session.add(history)
        row.last_run_at = started
        row.last_status = None
        await session.flush()
        history_id = history.id
        await session.commit()

    workdir = tempfile.mkdtemp(prefix="panshi_backup_")
    error_msg: Optional[str] = None
    package_name: Optional[str] = None
    file_size: Optional[int] = None
    try:
        # ── 外部 IO 段：快照 + 打包 + 推送（无事务）──
        cfg = db_config.load_config()
        conns, type_skipped = collect_sqlite_connections(cfg)
        if not conns:
            raise RuntimeError("注册表中没有 SQLite 连接，不适用 SQLite 异地备份")
        active_id = cfg.active
        snapshots, skipped = await asyncio.to_thread(
            snapshot_sqlite_databases, conns, active_id, workdir
        )
        all_skipped = [{"conn_id": cid, "reason": "非 SQLite 类型"} for cid in type_skipped] + skipped
        snap_ids = {s["conn_id"] for s in snapshots}
        meta = {
            "active_connection_id": active_id,
            # original_path 用注册表原样路径（多为相对 backend/），恢复时按当前环境重新 resolve
            "databases": {c.id: {"original_path": c.path} for c in conns if c.id in snap_ids},
        }
        pkg_path, meta = await asyncio.to_thread(
            build_package,
            workdir=workdir,
            snapshots=snapshots,
            skipped=all_skipped,
            includes=includes,
            version_info=_app_version_info(),
            meta=meta,
        )
        package_name = Path(pkg_path).name
        file_size = Path(pkg_path).stat().st_size

        await ensure_remote_dir(target, remote_dir, password, key_path)
        await push_package(target, pkg_path, remote_dir, package_name, password, key_path)
        await cleanup_retention(target, remote_dir, retain_count, password, key_path)
    except Exception as exc:
        error_msg = str(exc)[:2000]
    finally:
        import shutil as _shutil

        _shutil.rmtree(workdir, ignore_errors=True)

    # ── 第二段：回写历史与状态 ──
    finished = _utcnow()
    duration_ms = int((finished - started).total_seconds() * 1000)
    own_ctx2 = _session_or(db)
    async with own_ctx2 as session:
        history = await session.get(DbBackupHistory, history_id)
        if history is not None:
            history.finished_at = finished
            history.status = "failed" if error_msg else "success"
            history.package_name = package_name
            history.file_size = file_size
            history.duration_ms = duration_ms
            history.error = error_msg
        cfg_row = await session.get(DbBackupConfig, 1)
        if cfg_row is not None:
            cfg_row.last_status = "failed" if error_msg else "success"
            if error_msg:
                cfg_row.last_error = error_msg
            else:
                cfg_row.last_error = None
                cfg_row.last_success_at = finished
        await session.commit()

    if error_msg:
        raise RuntimeError(error_msg)
    return {
        "id": history_id,
        "status": "success",
        "trigger": trigger,
        "started_at": started.isoformat() if started else None,
        "finished_at": finished.isoformat() if finished else None,
        "package_name": package_name,
        "file_size": file_size,
        "duration_ms": duration_ms,
        "error": None,
    }


# ── 调度循环（main.py lifespan 拉起，与 _relay_refresh_loop 同款）────────────


async def backup_scheduler_loop(interval: float = 30.0) -> None:
    """周期检查到期备份；迁移运行中 / 进行中 / 未启用 / 未到期均跳过。"""
    while True:
        await asyncio.sleep(interval)
        try:
            await scheduler_tick()
        except asyncio.CancelledError:
            raise
        except Exception:  # pragma: no cover - 单周期失败不影响后续
            logger.exception("SQLite 备份调度周期执行失败")


async def scheduler_tick() -> bool:
    """单次调度判定。返回是否触发（主要用于测试）。"""
    from app.core import maintenance
    from app.core.database import AsyncSessionLocal
    from app.models.db_backup import DbBackupConfig

    if maintenance._migration_lock.is_set():
        return False
    if inflight_busy():
        return False
    async with AsyncSessionLocal() as db:
        row = await db.get(DbBackupConfig, 1)
        if row is None or not row.enabled:
            return False
        complete, _reason = config_complete(row)
        if not complete:
            return False
        anchor = row.last_run_at or row.last_success_at
        interval_minutes = row.interval_minutes or 5
    # 会话已关闭再判定/触发（不持事务跨 IO）
    if anchor is not None:
        elapsed = (_utcnow() - anchor).total_seconds()
        if elapsed < interval_minutes * 60:
            return False
    await perform_backup(trigger="scheduled")
    return True
