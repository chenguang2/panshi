"""Migration write-lock (design G2).

While a database migration is running, block write requests with 503 so the
migration snapshot stays consistent with what gets switched to afterwards.
Reads stay available.
"""

import threading

_migration_lock = threading.Event()

WRITE_METHODS = {"POST", "PUT", "DELETE", "PATCH"}


def set_migration_in_progress(on: bool) -> None:
    if on:
        _migration_lock.set()
    else:
        _migration_lock.clear()


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
