"""Migration write-lock (design G2).

While a database migration is running, block write requests with 503 so the
migration snapshot stays consistent with what gets switched to afterwards.
Reads stay available.
"""

import threading
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class MigrationProgress:
    """Detailed progress snapshot for an in-flight migration."""
    phase: str = ""              # "backup" | "migrating" | ""
    backup_done: int = 0
    backup_total: int = 0
    table_index: int = 0
    total_tables: int = 0
    current_table: str = ""
    copied_rows: int = 0
    total_rows: int = 0
    skipped: bool = False


@dataclass
class MigrationState:
    in_progress: bool = False
    source_id: Optional[str] = None
    target_id: Optional[str] = None
    started_at: Optional[datetime] = None
    progress: MigrationProgress = field(default_factory=MigrationProgress)


_migration_lock = threading.Event()
_state = MigrationState()

WRITE_METHODS = {"POST", "PUT", "DELETE", "PATCH"}


def set_migration_in_progress(on: bool, source_id: Optional[str] = None, target_id: Optional[str] = None) -> None:
    global _state
    if on:
        _migration_lock.set()
        _state = MigrationState(
            in_progress=True,
            source_id=source_id,
            target_id=target_id,
            started_at=datetime.utcnow(),
        )
    else:
        _migration_lock.clear()
        _state = MigrationState()


def update_migration_progress(**kwargs) -> None:
    """Update progress fields of the current migration state (called from SSE endpoint)."""
    global _state
    if not _state.in_progress:
        return
    for k, v in kwargs.items():
        if hasattr(_state.progress, k):
            setattr(_state.progress, k, v)


def get_migration_state() -> MigrationState:
    return _state


def migration_in_progress() -> bool:
    return _migration_lock.is_set()


def _connection_label(conn_id: Optional[str]) -> str:
    """连接 ID → 展示名：优先连接名，拿不到回退 ID（读 db_config.json，纯文件读，无网络/DB IO）。"""
    if not conn_id:
        return "未知"
    try:
        from app.core.db_config import load_config  # 函数内 import 防循环导入

        conn = load_config().get_connection(conn_id)
        if conn and conn.name:
            return conn.name
    except Exception:
        pass
    return conn_id


def _migration_lock_detail() -> str:
    state = get_migration_state()
    src = _connection_label(state.source_id)
    dst = _connection_label(state.target_id)
    return f"数据库迁移进行中（{src} → {dst}），所有写操作暂被锁定，完成后自动恢复；进度见『数据迁移』页"


async def maintenance_middleware(request, call_next):
    if _migration_lock.is_set() and request.method in WRITE_METHODS:
        from fastapi.responses import JSONResponse
        from starlette import status

        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"detail": _migration_lock_detail()},
        )
    return await call_next(request)
