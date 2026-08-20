import os
from typing import AsyncGenerator, Optional

from sqlalchemy import create_engine, event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine as _create_async_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import DeclarativeBase

from app.core import db_config
from app.core.db_config import ConnectionConfig, build_async_engine_url, build_engine_url

DEFAULT_DATABASE_URL = "sqlite:///./data/panshi.db"
DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL)

# Re-export config paths so they can be monkeypatched in tests.
CONFIG_PATH = db_config.CONFIG_PATH
CONFIG_BAK_PATH = db_config.CONFIG_BAK_PATH


class Base(DeclarativeBase):
    pass


def _configure_sqlite_connection(db_api_connection, connection_record):
    cursor = db_api_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.close()


def is_sqlite(url: str) -> bool:
    return url.startswith("sqlite")


def get_active_connection() -> Optional[ConnectionConfig]:
    """Return the currently active connection from the config file."""
    cfg = db_config.ensure_config(path=CONFIG_PATH)
    return cfg.get_active()


def build_sync_engine_for(conn: ConnectionConfig):
    """Build a sync engine for an arbitrary connection (used by migration service)."""
    url = build_engine_url(conn)
    if is_sqlite(url):
        engine = create_engine(
            url,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        event.listen(engine, "connect", _configure_sqlite_connection)
        return engine
    return create_engine(url)


def build_async_engine_for(conn: ConnectionConfig):
    """Build an async engine for an arbitrary connection (used by migration service)."""
    url = build_async_engine_url(conn)
    return _create_async_engine(url)


def _active_async_engine():
    """Build the async engine for the active connection (once at startup)."""
    conn = get_active_connection()
    if conn is None:
        conn = db_config.default_config().get_active()
    assert conn is not None
    return build_async_engine_for(conn)


def create_sync_engine():
    """Sync engine for the active connection (used by migrations)."""
    conn = get_active_connection()
    if conn is None:
        conn = db_config.default_config().get_active()
    assert conn is not None
    return build_sync_engine_for(conn)


_async_engine = _active_async_engine()

AsyncSessionLocal = async_sessionmaker(
    bind=_async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


def get_db_url() -> str:
    conn = get_active_connection()
    if conn is None:
        return DATABASE_URL
    return build_engine_url(conn)


def _reload_active_engine():
    """Rebuild the module-level async engine + session maker for the active config."""
    global _async_engine, AsyncSessionLocal
    if hasattr(_async_engine, "dispose"):
        # best-effort dispose of old engine
        try:
            _async_engine.sync_engine.dispose()
        except Exception:
            pass
    _async_engine = _active_async_engine()
    AsyncSessionLocal = async_sessionmaker(
        bind=_async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )


async def init_db():
    # G9: on startup, roll back to .bak if the active connection fails and a
    # switch flag is present (the switch was never completed successfully).
    from app.services import db_switch_service

    rolled_back = db_switch_service.check_and_rollback_startup()
    if rolled_back:
        _reload_active_engine()

    async with _async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Run schema migrations (requires sync engine for ALTER TABLE)
    from app.core.migrate import run_migrations

    run_migrations(create_sync_engine())


async def close_db():
    await _async_engine.dispose()
