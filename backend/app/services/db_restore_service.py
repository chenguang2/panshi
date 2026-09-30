"""SQLite DR 恢复向导服务：远端列表 / 下载校验暂存 / 落位激活。

设计要点（docs/design/sqlite-backup-dr.md）：
- 远端包元信息经 `tar -xzOf <pkg> meta.json` 远程读取，避免整包下载；
- 校验通过后暂存于临时目录（TTL 过期自动清理），执行阶段复用，避免二次下载；
- 落位顺序：key 文件（600 权限）→ 各库 .restored-<ts> → 配置/清单 → 清理旧
  .restored-* 残留 → 旧活动库改名 .pre-restore-<ts> → db_config 指针切换 →
  引擎重载激活（MUST NOT 热替换正在使用的数据库文件）；
- 备份/恢复共用 in-flight 互斥（db_backup_service._INFLIGHT_LOCK）；
- 切换前检查运行中节点任务（继承 database-management 切换语义）；
- 约定 #29：外部 IO 期间不持数据库事务。
"""

import asyncio
import json
import logging
import os
import re
import shlex
import sqlite3
import tarfile
import tempfile
import threading
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from app.services import db_backup_service as bsvc
from app.services.db_backup_service import _run, _ssh_argv

logger = logging.getLogger(__name__)

SCP_DOWNLOAD_TIMEOUT_SECONDS = 300
PACKAGE_NAME_RE = re.compile(r"^panshi_backup_\d{8}_\d{6}\.tar\.gz$")
STAGE_TTL_SECONDS = 600  # 暂存 10 分钟

# 暂存表：verify_id → {dir, meta, package_name, target, expires}
_STAGED: dict = {}
_STAGED_LOCK = threading.Lock()

# 恢复库关键表（校验阶段必须存在）
_KEY_TABLES = ("sys_user", "ps_cluster")


def _backend_root() -> Path:
    return bsvc._backend_root()


def _creds(target: dict) -> tuple:
    return target.get("password") or None, target.get("private_key_path") or None


async def _ssh_run(target: dict, remote_cmd: str, timeout: Optional[int] = None):
    password, key_path = _creds(target)
    argv, env = _ssh_argv(target, remote_cmd, password, key_path)
    return await _run(argv, env, timeout=timeout or 300)


def _scp_download_argv(target: dict, remote: str, local: str, password, key_path=None):
    """scp 下载方向：user@host:remote → local。"""
    base = [*bsvc._SSH_BASE_OPTS, "-P", str(int(target.get("port") or 22))]
    if password:
        bsvc._require_sshpass(password)
        argv = ["sshpass", "-e", "scp", *base, f"{target['username']}@{target['host']}:{remote}", local]
        return argv, {**os.environ, "SSHPASS": password}
    argv = ["scp", *bsvc._ssh_base_for_key(key_path), *base, f"{target['username']}@{target['host']}:{remote}", local]
    return argv, dict(os.environ)


def _engine_reload() -> None:
    """引擎重载激活（call-time 解析，测试可 patch rst._engine_reload）。"""
    from app.core.database import _reload_active_engine

    _reload_active_engine()


def _utcnow() -> datetime:
    return datetime.utcnow()


def _ts_suffix() -> str:
    return _utcnow().strftime("%Y%m%d_%H%M%S")


def _clean_expired_staged() -> None:
    now = _utcnow()
    with _STAGED_LOCK:
        expired = [k for k, v in _STAGED.items() if v["expires"] < now]
        for k in expired:
            entry = _STAGED.pop(k)
            _rmtree(entry.get("dir"))


def _rmtree(path: str) -> None:
    if not path:
        return
    import shutil

    shutil.rmtree(path, ignore_errors=True)


def get_staged(verify_id: str) -> Optional[dict]:
    _clean_expired_staged()
    with _STAGED_LOCK:
        return _STAGED.get(verify_id)


def drop_staged(verify_id: str) -> None:
    with _STAGED_LOCK:
        entry = _STAGED.pop(verify_id, None)
    if entry:
        _rmtree(entry.get("dir"))


async def list_remote_packages(target: dict) -> list:
    """列出远端目录中的备份包（白名单过滤 + meta 摘要远程读取）。"""
    remote_dir = target["remote_dir"]
    rc, out, err = await _ssh_run(target, f"ls -1 {shlex.quote(remote_dir)} 2>/dev/null || true")
    if rc != 0:
        raise RuntimeError(f"读取远端目录失败：{err or out}")
    names = [n.strip() for n in out.splitlines() if n.strip()]
    names = [n for n in names if PACKAGE_NAME_RE.match(n)]
    if not names:
        return []

    # 批量取大小（一条 stat）
    stat_cmd = f"cd {shlex.quote(remote_dir)} && stat -c %s " + " ".join(
        shlex.quote(n) for n in names
    )
    rc, out, err = await _ssh_run(target, stat_cmd)
    sizes = {}
    if rc == 0:
        for name, line in zip(names, out.splitlines()):
            try:
                sizes[name] = int(line.strip())
            except ValueError:
                pass

    items = []
    for name in names:
        summary = await _remote_meta_summary(target, remote_dir, name)
        items.append(
            {
                "package_name": name,
                "file_size": sizes.get(name),
                "created_at": summary.get("created_local") or summary.get("created_utc"),
                "app_version": summary.get("app_version"),
                "git_commit": summary.get("git_commit"),
                "active_connection_id": summary.get("active_connection_id"),
                "databases": sorted((summary.get("databases") or {}).keys()),
                "skipped_databases": summary.get("skipped_databases") or [],
                "missing_b_segments": _missing_b_segments(summary.get("includes") or {}),
                "meta_error": summary.get("_error"),
            }
        )
    items.sort(key=lambda x: x["package_name"], reverse=True)
    return items


def _missing_b_segments(includes: dict) -> list:
    """包未包含的 B 类数据段（静态资源/任务脚本/任务日志）。"""
    return [k for k in ("static", "task_scripts", "task_logs") if not includes.get(k)]


async def _remote_meta_summary(target: dict, remote_dir: str, name: str) -> dict:
    cmd = f"cd {shlex.quote(remote_dir)} && tar -xzOf {shlex.quote(name)} meta.json 2>/dev/null"
    rc, out, err = await _ssh_run(target, cmd, timeout=30)
    if rc != 0 or not out.strip():
        return {"_error": f"meta.json 读取失败（远端需支持 tar）"}
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        return {"_error": "meta.json 解析失败"}


async def verify_and_stage(target: dict, package_name: str) -> dict:
    """下载并完整校验一个包，通过后暂存。返回校验摘要（含 verify_id）。

    校验链：存在性 → tar 完整性 → 逐文件 SHA256/大小 → 各库 integrity_check +
    关键表存在性。任一失败抛 RuntimeError（不暂存）。
    """
    if not PACKAGE_NAME_RE.match(package_name or ""):
        raise RuntimeError("非法的包名")
    remote_dir = target["remote_dir"]
    quoted = shlex.quote(package_name)
    rc, _, _ = await _ssh_run(
        target, f"cd {shlex.quote(remote_dir)} && test -f {quoted} && echo exists", timeout=30
    )
    if rc != 0:
        raise RuntimeError(f"远端包不存在（可能已被清理），请刷新列表后重试")

    _clean_expired_staged()
    stage_dir = tempfile.mkdtemp(prefix="panshi_restore_")
    try:
        local_pkg = str(Path(stage_dir) / package_name)
        # scp 下载（远端 → 本地暂存目录）
        password, key_path = _creds(target)
        argv, env = _scp_download_argv(
            target, f"{remote_dir}/{package_name}", local_pkg, password, key_path
        )
        rc, out, err = await _run(argv, env, timeout=SCP_DOWNLOAD_TIMEOUT_SECONDS)
        if rc != 0:
            raise RuntimeError(f"下载备份包失败：{err or out}")

        extract_dir = Path(stage_dir) / "x"
        extract_dir.mkdir()
        with tarfile.open(local_pkg) as tf:
            tf.extractall(extract_dir, filter="data")  # tar 完整性：读全量成员
        meta = json.loads((extract_dir / "meta.json").read_text())

        # 逐文件 SHA256 + 大小
        problems = []
        for rel, info in (meta.get("files") or {}).items():
            f = extract_dir / rel
            if not f.exists():
                problems.append(f"缺少文件 {rel}")
                continue
            if f.stat().st_size != info.get("size"):
                problems.append(f"大小不符 {rel}")
                continue
            if bsvc._sha256(f) != info.get("sha256"):
                problems.append(f"SHA256 校验失败 {rel}")
        if problems:
            raise RuntimeError("包完整性校验失败：" + "; ".join(problems[:5]))

        # 各库 integrity_check + 关键表
        db_report = {}
        for conn_id, db_meta in (meta.get("databases") or {}).items():
            archive = db_meta.get("archive")
            db_file = extract_dir / archive if archive else None
            if not db_file or not db_file.exists():
                db_report[conn_id] = {"integrity": "missing"}
                problems.append(f"缺少库文件 {conn_id}")
                continue
            try:
                con = sqlite3.connect(f"file:{db_file}?mode=ro", uri=True)
                try:
                    integrity = con.execute("PRAGMA integrity_check").fetchone()[0]
                    tables = {
                        r[0]
                        for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
                    }
                finally:
                    con.close()
            except sqlite3.DatabaseError as exc:
                db_report[conn_id] = {"integrity": f"error: {exc}"}
                problems.append(f"库 {conn_id} 无法打开：{exc}")
                continue
            missing_tables = [t for t in _KEY_TABLES if t not in tables]
            db_report[conn_id] = {"integrity": integrity, "missing_key_tables": missing_tables}
            if integrity != "ok":
                problems.append(f"库 {conn_id} integrity_check={integrity}")
            elif missing_tables:
                problems.append(f"库 {conn_id} 缺少关键表 {missing_tables}")
        if problems:
            raise RuntimeError("包数据库校验失败：" + "; ".join(problems[:5]))

        verify_id = uuid.uuid4().hex
        with _STAGED_LOCK:
            _STAGED[verify_id] = {
                "dir": stage_dir,
                "extract_dir": str(extract_dir),
                "meta": meta,
                "package_name": package_name,
                "created": _utcnow(),
                "expires": _utcnow() + timedelta(seconds=STAGE_TTL_SECONDS),
            }
        return {
            "verify_id": verify_id,
            "package_name": package_name,
            "created_at": meta.get("created_local") or meta.get("created_utc"),
            "app_version": meta.get("app_version"),
            "git_commit": meta.get("git_commit"),
            "active_connection_id": meta.get("active_connection_id"),
            "databases": db_report,
            "skipped_databases": meta.get("skipped_databases") or [],
            "missing_b_segments": _missing_b_segments(meta.get("includes") or {}),
            "expires_at": _STAGED[verify_id]["expires"].isoformat(),
        }
    except Exception:
        _rmtree(stage_dir)
        raise


def _resolve_backend_path(rel_path: str) -> Path:
    """按当前环境解析 meta 记录的库原路径（相对 backend/）。"""
    p = Path(rel_path)
    return p if p.is_absolute() else (_backend_root() / p).resolve()


def _write_key_file(src: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    data = src.read_bytes()
    fd = os.open(dest, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        os.write(fd, data)
    finally:
        os.close(fd)
    os.chmod(dest, 0o600)


async def _find_running_tasks(db=None) -> list:
    """运行中节点任务检查（继承 database-management 切换语义）。"""
    from sqlalchemy import select as _select

    from app.models.node_task import NodeTask

    if db is not None:
        result = await db.execute(_select(NodeTask).where(NodeTask.status == "running"))
        return result.scalars().all()
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as s:
        result = await s.execute(_select(NodeTask).where(NodeTask.status == "running"))
        return result.scalars().all()


async def execute_restore(verify_id: str, confirmed: bool, db=None) -> dict:
    """落位激活：高危确认 → 互斥 → 运行中任务检查 → 分段落位 → 引擎重载。

    返回 {"activated": True, "active_connection_id": ..., "restored_databases": [...]}
    """
    from app.core import db_config as dbc
    from app.core.database import AsyncSessionLocal

    if not confirmed:
        raise RuntimeError("未勾选高危确认，已拒绝恢复")

    if not bsvc.try_acquire_inflight():
        drop_staged(verify_id)
        raise RuntimeError("已有备份/恢复任务进行中，请稍后再试")

    try:
        staged = get_staged(verify_id)
        if staged is None:
            raise RuntimeError("校验会话已过期或不存在，请重新校验后重试")

        # 运行中任务检查（继承 database-management 切换语义）
        running = await _find_running_tasks(db)
        if running:
            raise RuntimeError("有节点任务正在运行，请等待完成或取消后再恢复")

        meta = staged["meta"]
        extract = Path(staged["extract_dir"])
        ts = _ts_suffix()
        root = _backend_root()

        databases = meta.get("databases") or {}
        active_id = meta.get("active_connection_id")

        # 当前注册表（用于定位旧活动库文件）——恒从 backend 根解析，避免 CWD 漂移
        reg_path = str(root / "db_config.json")
        cur_cfg = dbc.load_config(reg_path)
        cur_active = cur_cfg.get_active() if cur_cfg else None

        # 0) 清理历史 .restored-* 残留（落位前，避免与本次混淆）
        for db_meta in databases.values():
            orig = _resolve_backend_path(db_meta.get("original_path") or "")
            if orig.parent.exists():
                for stale in orig.parent.glob(f"{orig.name}.restored-*"):
                    try:
                        stale.unlink()
                        logger.info("清理历史恢复残留 %s", stale)
                    except OSError:
                        pass

        restored_files = {}
        # 1) key 文件（600 权限）。.jwt_secret 源自 backend/data/.jwt_secret（security.py
        #    开发态密钥文件）；Fernet 无模块级缓存（_fernet() 每次按 env 重建），恢复的
        #    db_config 密码立即可用；JWT 模块常量在重启后完全切换。
        key_src = extract / "config" / ".jwt_secret"
        if key_src.exists():
            data_dir = root / "data"
            data_dir.mkdir(parents=True, exist_ok=True)
            _write_key_file(key_src, data_dir / ".jwt_secret")
        for env_file in (extract / "config").glob(".env.*"):
            _write_key_file(env_file, root / env_file.name)

        # 2) 库文件落位 .restored-<ts>
        for conn_id, db_meta in databases.items():
            src = extract / (db_meta.get("archive") or f"databases/{conn_id}.db")
            orig = _resolve_backend_path(db_meta.get("original_path") or "")
            dest = orig.with_name(f"{orig.name}.restored-{ts}")
            dest.parent.mkdir(parents=True, exist_ok=True)
            data = src.read_bytes()
            fd = os.open(dest, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o640)
            try:
                os.write(fd, data)
            finally:
                os.close(fd)
            restored_files[conn_id] = dest

        # 3) 配置/清单/Ansible/data 段落回原位（包内有的才落）
        for rel in ("config/db_config.json", "config/features.yaml", "config/clickhouse.yaml"):
            src = extract / rel
            if src.exists():
                dest = root / Path(rel).name
                dest.write_text(src.read_text())
        for prefix in ("ansible", "data"):
            src_root = extract / prefix
            if not src_root.exists():
                continue
            for f in src_root.rglob("*"):
                if f.is_file():
                    rel = f.relative_to(extract)
                    dest = root / rel
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    dest.write_bytes(f.read_bytes())

        # 4) db_config.json：路径改指恢复库 + active 指针切换（先备份 .bak）
        reg = json.loads(Path(reg_path).read_text())
        if cur_active is not None:
            try:
                dbc.backup_current_config(str(reg_path))
            except Exception:
                logger.warning("db_config .bak 备份失败（继续）")
        for conn in reg.get("connections", []):
            if conn.get("id") in restored_files:
                conn["path"] = os.path.relpath(
                    restored_files[conn["id"]], root
                ).replace(os.sep, "/")
        if active_id and any(c.get("id") == active_id for c in reg.get("connections", [])):
            reg["active"] = active_id
        Path(reg_path).write_text(json.dumps(reg, ensure_ascii=False, indent=2))

        # 5) 旧活动库保留 .pre-restore-<ts>
        pre_restore = None
        if cur_active is not None and cur_active.id not in restored_files:
            old = _resolve_backend_path(cur_active.path or "")
            if old.exists():
                pre_restore = old.with_name(f"{old.name}.pre-restore-{ts}")
                old.rename(pre_restore)
        elif cur_active is not None:
            # 旧活动库与某恢复库同源（同原路径）：旧文件仍在原路径
            old = _resolve_backend_path(cur_active.path or "")
            if old.exists() and old not in restored_files.values():
                pre_restore = old.with_name(f"{old.name}.pre-restore-{ts}")
                old.rename(pre_restore)

        # 6) 引擎重载激活（不热替换在用文件——新库独立落盘，仅指针切换）
        _engine_reload()
        try:
            from app.services import relay_registry

            await relay_registry.ensure_fresh(force=True)
        except Exception:
            logger.exception("恢复后中继路由快照刷新失败")

        # 审计写入恢复后的活动库（新引擎短会话，约定 #29：无长事务）
        try:
            from app.services.audit import log_audit

            async with AsyncSessionLocal() as s2:
                log_audit(
                    s2,
                    action="db_backup_restore",
                    resource="db_backup",
                    detail=f"从 {staged['package_name']} 恢复并激活 active={active_id}",
                )
                await s2.commit()
        except Exception:
            logger.exception("恢复审计写入失败（不影响激活结果）")

        drop_staged(verify_id)
        return {
            "activated": True,
            "active_connection_id": active_id,
            "restored_databases": sorted(restored_files.keys()),
            "pre_restore_file": str(pre_restore) if pre_restore else None,
            "message": "恢复完成并已激活，当前已工作在恢复后的数据上",
        }
    finally:
        bsvc.release_inflight()
