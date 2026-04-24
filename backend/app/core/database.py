import os
from typing import AsyncGenerator

from sqlalchemy import create_engine, event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine as _create_async_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import DeclarativeBase

DEFAULT_DATABASE_URL = "sqlite:///./data/panshi.db"
DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL)


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


def create_sync_engine():
    if is_sqlite(DATABASE_URL):
        engine = create_engine(
            DATABASE_URL,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        event.listen(engine, "connect", _configure_sqlite_connection)
    else:
        engine = create_engine(DATABASE_URL)
    return engine


def _create_async_engine_fn():
    if is_sqlite(DATABASE_URL):
        async_database_url = DATABASE_URL.replace("sqlite://", "sqlite+aiosqlite://")
        return _create_async_engine(async_database_url)
    else:
        if DATABASE_URL.startswith("postgresql://"):
            async_database_url = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")
        else:
            async_database_url = DATABASE_URL
        return _create_async_engine(async_database_url)


_sync_engine = create_sync_engine()
_async_engine = _create_async_engine_fn()

SyncSessionLocal = async_sessionmaker(
    bind=_sync_engine,
    expire_on_commit=False,
)

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
    return DATABASE_URL


async def init_db():
    async with _async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def close_db():
    await _async_engine.dispose()
