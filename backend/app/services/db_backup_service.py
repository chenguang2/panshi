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
import socket
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
from sqlalchemy.exc import IntegrityError

from app.core import db_config
from app.services.ansible_service import _sshpass_available

if TYPE_CHECKING:  # pragma: no cover
    from app.models.db_backup import DbBackupConfig

# ── 常量 ────────────────────────────────────────────────────────────────────

# 组合白名单正则（设计 D2，单点定义，恢复侧 db_restore_service 复用）：
# 新格式 panshi_backup_{source}_{时间戳}.tar.gz ∪ 旧格式 panshi_backup_{时间戳}.tar.gz。
# 解析用字符类 [A-Za-z0-9._-]+ 有意保持宽容超集——生成侧已被 SOURCE_NAME_RE 收紧。
PACKAGE_NAME_RE = re.compile(
    r"^(?:panshi_backup_[A-Za-z0-9._-]+_\d{8}_\d{6}|panshi_backup_\d{8}_\d{6})\.tar\.gz$"
)
# 拆分解析（两分支不相交、拆分唯一）：时间戳后缀恰占尾部 15 字符（$ 锚定），
# source 随之唯一确定——source 含内嵌 `_数字_数字` 或纯数字也不产生歧义。
_PACKAGE_PARSE_RE = re.compile(
    r"^panshi_backup_(?:(?P<source>[A-Za-z0-9._-]+)_)?(?P<ts>\d{8}_\d{6})\.tar\.gz$"
)
META_FORMAT_VERSION = 1
SHANGHAI = ZoneInfo("Asia/Shanghai")

# 来源标识（设计 db-backup-source-tag D1/D2）——校验正则：首字符字母/数字、
# 字符白名单含点（容纳 hostname）、总长 ≤64；空串/None 视为「未填 → 自动解析」
SOURCE_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
# 自动解析全链路失败时的兜底常量
FALLBACK_SOURCE_NAME = "panshi"

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


def _package_name(source: str, now_shanghai: datetime) -> str:
    """`panshi_backup_{source}_{YYYYMMDD_HHMMSS}.tar.gz`（source 由调用方保证已清洗）。"""
    return f"panshi_backup_{source}_{now_shanghai:%Y%m%d_%H%M%S}.tar.gz"


def parse_package_name(name: str) -> tuple[Optional[str], Optional[str]]:
    """解析包名 → (source | None, "YYYYMMDD_HHMMSS")。

    - 新格式 → (source, ts)；旧格式（升级前，无 source）→ (None, ts)
    - 非白名单名 → (None, None)
    - 文件名解析是来源标识的唯一事实来源（设计 D5）：排序 / 保留清理 / 列表展示同源
    """
    m = _PACKAGE_PARSE_RE.match(name or "")
    if not m:
        return None, None
    return m.group("source"), m.group("ts")


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
    source: Optional[str] = None,
) -> tuple[str, dict]:
    """把快照 + 配置/密钥/清单/数据段打成 tar.gz。

    返回 (包绝对路径, 最终 meta dict)。meta['files'] 在此填充完整清单。
    source：来源标识，进包名（新格式）；None 时退回旧格式命名（兼容直调场景）。
    """
    root = _backend_root()
    now_shanghai = datetime.now(SHANGHAI)
    if source:
        name = _package_name(source, now_shanghai)
    else:
        name = f"panshi_backup_{now_shanghai:%Y%m%d_%H%M%S}.tar.gz"
    pkg_path = str(Path(workdir) / name)

    meta.setdefault("format_version", META_FORMAT_VERSION)
    meta["app_version"] = version_info.get("app_version")
    meta["git_commit"] = version_info.get("git_commit")
    if source:
        # 来源标识进 meta（设计 D5）：恢复侧展示/核对用；随 format_version 机制向后兼容
        meta["source"] = source
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
        if not PACKAGE_NAME_RE.match(name):
            continue
        packages.append({"name": name, "mtime_epoch": int(ts)})
    # 按包名中的时间戳倒序（混合来源下文件名字典序不再等价时间序，设计 D4）；
    # 解析失败（理论不可达：白名单保证可解析）兜底 mtime 放末尾
    packages.sort(
        key=lambda p: (parse_package_name(p["name"])[1] or "", p["mtime_epoch"]),
        reverse=True,
    )
    return packages


async def cleanup_retention(target: dict, remote_dir: str, retain_count: int, source: str,
                            password: Optional[str] = None, key_path: Optional[str] = None) -> list[str]:
    """保留最近 retain_count 份，删更旧的（设计 D3：候选集按源过滤）。

    - 候选集 = {新格式且 source == 本机} ∪ {旧格式包}——旧格式必须能自然老化，
      否则升级前本机产物永久堆积；共享目录多实例可竞争删 legacy（有界过渡态）
    - **绝不删除其他 source 的新格式包**（可能是别机命脉），也不计入保留份数
    - own source 经 re.escape 参与匹配（防正则注入放大匹配面）
    """
    out = await _remote_exec(target, f"ls -1 {shlex.quote(remote_dir)} 2>/dev/null || true", password, key_path)
    own_re = re.compile(rf"^panshi_backup_{re.escape(source)}_\d{{8}}_\d{{6}}\.tar\.gz$")
    legacy_re = re.compile(r"^panshi_backup_\d{8}_\d{6}\.tar\.gz$")
    candidates = [n.strip() for n in out.splitlines() if own_re.match(n.strip()) or legacy_re.match(n.strip())]
    # 候选集内按包名时间戳倒序（与格式无关，新旧混排）
    candidates.sort(key=lambda n: (parse_package_name(n)[1] or "", n), reverse=True)
    to_remove = candidates[retain_count:]
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


async def ensure_targets_migrated(db=None) -> bool:
    """存量单行配置一次性迁移为「默认位置」（设计 D7，幂等）。

    - 触发：全局行 targets_migrated 为假 **且** 旧目标字段（host）非空
    - 动作：复制全部旧目标字段建 name='default' 的位置（enabled=True）并置位标志；
      旧列不回写不清空（回滚到旧版代码仍可按单目标跑）
    - 标志置位后不再触发（防「删光位置后重启 → 默认位置复活」）
    - 并发幂等靠 name 唯一约束：插入冲突回滚后重查认领（不重复建）
    - 挂载点：lifespan 启动 + GET /config 首读兜底（双保险）
    """
    from app.core.database import AsyncSessionLocal
    from app.models.db_backup import DbBackupConfig, DbBackupTarget

    @contextlib.asynccontextmanager
    async def _session():
        if db is not None:
            yield db
        else:
            async with AsyncSessionLocal() as s:
                yield s

    async with _session() as session:
        row = await session.get(DbBackupConfig, 1)
        if row is None or row.targets_migrated:
            return False
        if not row.host:
            return False
        existing = (
            await session.execute(select(DbBackupTarget).where(DbBackupTarget.name == "default"))
        ).scalars().first()
        row.targets_migrated = True
        if existing is None:
            session.add(
                DbBackupTarget(
                    name="default",
                    host=row.host,
                    port=row.port or 22,
                    username=row.username,
                    auth_type=row.auth_type or "password",
                    password_encrypted=row.password_encrypted,
                    key_path=row.key_path,
                    remote_dir=row.remote_dir,
                    retain_count=row.retain_count or 7,
                    enabled=True,
                )
            )
        try:
            await session.commit()
        except IntegrityError:
            # 并发对手方已建 default（name 唯一约束兜底）：回滚后仅认领标志
            await session.rollback()
            row2 = await session.get(DbBackupConfig, 1)
            if row2 is not None and not row2.targets_migrated:
                row2.targets_migrated = True
                await session.commit()
        return True


def config_complete(row) -> tuple[bool, Optional[str]]:
    """多目标化后仅用于兼容判断：全局行不再承载目标连接字段。

    新语义见 get_enabled_targets（无启用位置 = 不完整）。
    """
    if not row.host or not row.username or not row.remote_dir:
        return False, "主机 / 用户名 / 远端目录未配置完整"
    if row.auth_type == "password" and not row.password_encrypted:
        return False, "密码认证未设置密码"
    if row.auth_type == "key" and not row.key_path:
        return False, "密钥认证未设置私钥路径"
    return True, None


async def get_enabled_targets(db) -> list:
    """启用位置（按 id 升序 = 「第一个启用位置」的扇出/探测方向，D3/D8）。"""
    from app.models.db_backup import DbBackupTarget

    rows = (
        await db.execute(
            select(DbBackupTarget)
            .where(DbBackupTarget.enabled.is_(True))
            .order_by(DbBackupTarget.id.asc())
        )
    ).scalars().all()
    return list(rows)


def backup_target_to_service(t) -> tuple[dict, Optional[str], Optional[str]]:
    """位置行 → (target dict, password, key_path)（凭据解密，密码只进内存）。"""
    password = None
    if t.auth_type == "password" and t.password_encrypted:
        try:
            password = db_config.decrypt_password(t.password_encrypted)
        except Exception:
            password = None
    return (
        {
            "host": t.host,
            "port": t.port,
            "username": t.username,
            "auth_type": t.auth_type,
        },
        password,
        t.key_path if t.auth_type == "key" else None,
    )


# ── 来源标识解析（设计 D1：出口 IP → hostname → 兜底常量，一次性解析持久化）──


def _clean_source_name(raw: Optional[str]) -> str:
    """把探测到的原始标识清洗为满足校验正则的 source 名。

    - 非法字符逐个替换为 '-'（IPv6 冒号 → 如 ``fe80::1`` → ``fe80--1``，确定性变形）
    - 超长截断到 64 字符
    - 前导非字母数字字符去除（首字符必须字母/数字）；清洗后为空回退兜底常量
    """
    cleaned = re.sub(r"[^A-Za-z0-9._-]", "-", (raw or "").strip())
    cleaned = cleaned[:64]
    cleaned = re.sub(r"^[^A-Za-z0-9]+", "", cleaned)
    if not SOURCE_NAME_RE.match(cleaned):
        return FALLBACK_SOURCE_NAME
    return cleaned


def _detect_source_raw(host: Optional[str], port: Optional[int]) -> str:
    """探测原始标识（逐级回退）：出口 IP → 主机名 → 兜底常量。

    出口 IP 经 UDP ``connect`` 到备份目标 host:port——不发真实流量，只做本地
    路由选择，得到「目标侧看到的本机 IP」。目标未配置（半配置）时跳过直接
    落 hostname（粘滞，补救路径 = 清空字段重存即重解析）。
    """
    if host:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            try:
                s.settimeout(2)
                s.connect((host, int(port or 22)))
                ip = s.getsockname()[0]
                if ip:
                    return ip
            finally:
                s.close()
        except Exception:
            pass
    try:
        return socket.gethostname()
    except Exception:  # pragma: no cover - 极端环境
        return FALLBACK_SOURCE_NAME


async def resolve_source_name(
    row: "DbBackupConfig",
    force: bool = False,
    probe_host: Optional[str] = None,
    probe_port: Optional[int] = None,
) -> str:
    """解析来源标识并回写配置行（触发点收敛于此）。

    - 存储值非空且未强制 → 直接返回（**备份执行只读存储值，绝不动态探测**）
    - 否则探测 → 清洗 → 赋值 ``row.source_name``（回写仅挂在 ORM 对象上，
      由调用方事务提交持久化：配置保存在端点 commit 前、run_backup 在第一段
      commit 前——避免提前 commit 破坏审计同事务合并，约定 #37/#29）

    force=True 供配置保存「载荷空 → 重新解析」使用（清空字段重存即重解析）。
    探测方向（D8）：出口 IP 取 probe_host:probe_port（多目标下 = 第一个启用
    位置；未提供时跳过目标方向，直接 hostname → 兜底）。
    """
    stored = (row.source_name or "").strip()
    if stored and not force:
        return stored
    raw = await asyncio.to_thread(_detect_source_raw, probe_host, probe_port)
    source = _clean_source_name(raw)
    row.source_name = source
    return source


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
    """扇出执行（设计 D3/D4）：解析来源 → 构建一次 → 逐启用位置推送与保留清理。

    - 三态：全部启用位置成功 = success；部分 = partial；全败/构建失败 = failed
    - 构建阶段失败或无启用位置 → 整体 failed 且无子结果行
    - 单位置失败记录子结果后继续下一位置（不中断）
    - last_success_at 仅全绿更新；调度节奏仍按 last_run_at（成败均计）
    - 约定 #29：外部 IO 期间不持有数据库事务——三段式短会话
    """
    from app.core.database import AsyncSessionLocal
    from app.models.db_backup import DbBackupConfig, DbBackupHistory, DbBackupHistoryTarget

    started = _utcnow()
    history_id: Optional[int] = None

    @contextlib.asynccontextmanager
    async def _session_or(db_arg):
        if db_arg is not None:
            yield db_arg
        else:
            async with AsyncSessionLocal() as s:
                yield s

    # ── 第一段：读配置与位置 + 落历史骨架（commit 后不再持有事务）──
    async with _session_or(db) as session:
        row = await get_config_row(session)
        enabled_targets = await get_enabled_targets(session)
        if not enabled_targets:
            raise RuntimeError("无启用的备份位置：请先在备份管理中配置并启用位置")
        includes = {
            "static": bool(row.include_static),
            "task_scripts": bool(row.include_task_scripts),
            "task_logs": bool(row.include_task_logs),
        }
        # 来源标识解析（一次性持久化语义不变，D8）：探测方向 = 第一个启用位置；
        # 存量 NULL 首次备份在此回写（随本段 commit 持久化，此后只读存储值）
        first = enabled_targets[0]
        source_name = await resolve_source_name(row, probe_host=first.host, probe_port=first.port)
        history = DbBackupHistory(started_at=started, status="running", trigger=trigger)
        session.add(history)
        row.last_run_at = started
        row.last_status = None
        await session.flush()
        history_id = history.id
        await session.commit()

    workdir = tempfile.mkdtemp(prefix="panshi_backup_")
    build_error: Optional[str] = None
    package_name: Optional[str] = None
    file_size: Optional[int] = None
    target_results: list[dict] = []
    try:
        # ── 外部 IO 段 1：快照 + 打包（一次，与位置数无关，D2）──
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
            source=source_name,
        )
        package_name = Path(pkg_path).name
        file_size = Path(pkg_path).stat().st_size

        # ── 外部 IO 段 2：扇出推送（逐启用位置串行；失败记录子结果后继续）──
        for t in enabled_targets:
            t_target, t_password, t_key = backup_target_to_service(t)
            t_started = _utcnow()
            try:
                await ensure_remote_dir(t_target, t.remote_dir, t_password, t_key)
                await push_package(t_target, pkg_path, t.remote_dir, package_name, t_password, t_key)
                await cleanup_retention(
                    t_target, t.remote_dir, t.retain_count, source_name, t_password, t_key
                )
                t_status, t_error = "success", None
            except Exception as exc:  # noqa: BLE001 - 单位置失败不中断整体（D3）
                t_status, t_error = "failed", str(exc)[:1000]
            target_results.append(
                {
                    "target_id": t.id,
                    "target_name": t.name,
                    "status": t_status,
                    "error": t_error,
                    "duration_ms": int((_utcnow() - t_started).total_seconds() * 1000),
                }
            )
    except Exception as exc:  # noqa: BLE001 - 构建阶段失败：无子结果行
        build_error = str(exc)[:2000]
    finally:
        import shutil as _shutil

        _shutil.rmtree(workdir, ignore_errors=True)

    # ── 三态汇总（D4）──
    failed_results = [r for r in target_results if r["status"] == "failed"]
    if build_error:
        status = "failed"
        summary_error = build_error
    elif not failed_results:
        status = "success"
        summary_error = None
    elif len(failed_results) == len(target_results):
        status = "failed"
        summary_error = "; ".join(f"{r['target_name']}: {r['error']}" for r in failed_results)
    else:
        status = "partial"
        summary_error = "; ".join(f"{r['target_name']}: {r['error']}" for r in failed_results)

    # ── 第二段：回写历史与状态 ──
    finished = _utcnow()
    duration_ms = int((finished - started).total_seconds() * 1000)
    own_ctx2 = _session_or(db)
    async with own_ctx2 as session:
        history = await session.get(DbBackupHistory, history_id)
        if history is not None:
            history.finished_at = finished
            history.status = status
            history.package_name = package_name
            history.file_size = file_size
            history.duration_ms = duration_ms
            history.error = summary_error
        # 子结果行仅推送阶段产生（构建失败无子结果，D4）
        if not build_error:
            for r in target_results:
                session.add(
                    DbBackupHistoryTarget(
                        history_id=history_id,
                        target_id=r["target_id"],
                        target_name=r["target_name"],
                        status=r["status"],
                        error=r["error"],
                        duration_ms=r["duration_ms"],
                    )
                )
        cfg_row = await session.get(DbBackupConfig, 1)
        if cfg_row is not None:
            cfg_row.last_status = status
            cfg_row.last_error = summary_error
            if status == "success":
                # last_success_at 仅全绿更新（「距上次完整成功」展示指标）
                cfg_row.last_success_at = finished
        await session.commit()

    if status == "failed":
        raise RuntimeError(summary_error or "备份失败")
    return {
        "id": history_id,
        "status": status,
        "trigger": trigger,
        "started_at": started.isoformat() if started else None,
        "finished_at": finished.isoformat() if finished else None,
        "package_name": package_name,
        "file_size": file_size,
        "duration_ms": duration_ms,
        "error": summary_error,
        "targets": target_results,
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
        # 无启用位置 → 跳过（显示不适用，spec：无启用备份位置跳过）
        if not await get_enabled_targets(db):
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
