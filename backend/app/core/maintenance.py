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
            started_at=datetime.now(),
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


async def maintenance_middleware(request, call_next):
    if _migration_lock.is_set() and request.method in WRITE_METHODS:
        from fastapi.responses import JSONResponse
        from starlette import status

        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"detail": "正在迁移数据库，暂时禁止写操作，请稍后重试"},
        )
    return await call_next(request)
