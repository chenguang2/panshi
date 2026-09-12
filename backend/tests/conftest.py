import pytest
import asyncio
from contextlib import asynccontextmanager
from sqlalchemy import event
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.core.database import Base, get_db
from app.models.cluster import Cluster
from app.models.autostart import NodeAutostart
from fastapi.testclient import TestClient

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

# Minimal parent rows inserted into every test DB so child records referencing
# these ids pass the FK checks enabled by PRAGMA foreign_keys=ON below.
# Many model-level tests create e.g. SslCertificate/Route/Upstream/StreamProxy
# with a hardcoded cluster_id but never create the parent Cluster row.
# Upstream rows are intentionally NOT seeded: tests that reference an upstream
# create their own (e.g. test_route_with_upstream_reference), keeping the DB
# empty of seed data so count-based assertions in import tests stay valid.
SEED_CLUSTER_IDS = (1, 2, 3)

def _enable_sqlite_fk(dbapi_conn, record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.fixture(scope="function")
async def test_db():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    event.listen(engine.sync_engine, "connect", _enable_sqlite_fk)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        for cid in SEED_CLUSTER_IDS:
            existing = await session.get(Cluster, cid)
            if existing is None:
                session.add(Cluster(id=cid, name=f"seed-cluster-{cid}"))
        await session.commit()
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


# ---------------------------------------------------------------------------
# isolated_app: 全面隔离的 TestClient fixture
# ---------------------------------------------------------------------------
# 解决 test_db 与 isolated_app 双库问题：isolated_app 内部创建独立内存库，
# get_db override 确保 API 请求级 DB（audit/get_current_user/handler）全部
# 命中同一个内存库，与测试代码共享同一事务模型。
#
# 用法：
#   def test_something(isolated_app):
#       resp = isolated_app.get("/api/v1/...")
#
# 需要直接操作 session 时：
#   def test_something(isolated_app, isolated_session):
#       isolated_session.add(...)
#       resp = isolated_app.get("/api/v1/...")
# ---------------------------------------------------------------------------
from app.main import app as _fastapi_app
from tests.api_helpers import AuthedTestClient, isolated_app_lifespan


@pytest.fixture(scope="function")
def isolated_app():
    """创建全面隔离的 AuthedTestClient。

    - lifespan stub（init_db/seed_data/recover/shutdown 全部 noop）
    - get_db override → per-test 内存库
    - 最小种子：admin(id=1) + cluster(id=1)
    """
    from app.core.security import hash_password
    from app.models.user import User

    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    event.listen(engine.sync_engine, "connect", _enable_sqlite_fk)

    async def _setup():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with factory() as session:
            # 最小种子：admin + cluster
            if not await session.get(User, 1):
                session.add(User(
                    id=1, username="admin",
                    password_hash=hash_password("panshi123"),
                    role="admin",
                ))
            if not await session.get(Cluster, 1):
                session.add(Cluster(id=1, name="test-cluster"))
            await session.commit()

    loop = asyncio.new_event_loop()
    loop.run_until_complete(_setup())

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _get_db_override():
        async with session_factory() as session:
            try:
                yield session
            finally:
                await session.close()

    with isolated_app_lifespan():
        _fastapi_app.dependency_overrides[get_db] = _get_db_override
        with AuthedTestClient(_fastapi_app) as client:
            yield client
        _fastapi_app.dependency_overrides.clear()

    loop.run_until_complete(engine.dispose())
    loop.close()


# ---------------------------------------------------------------------------
# unauthenticated_app: 隔离的无认证 TestClient（不自动登录）
# ---------------------------------------------------------------------------
# 用于安全守卫测试：验证无 token 时端点返回 401。
# 与 isolated_app 相同的 DB 隔离，但不附加 Authorization 头。
# ---------------------------------------------------------------------------

@pytest.fixture(scope="function")
def unauthenticated_app():
    """创建隔离的无认证 TestClient。用于安全守卫测试验证 401 拒绝。"""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    event.listen(engine.sync_engine, "connect", _enable_sqlite_fk)

    async def _setup():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with factory() as session:
            if not await session.get(Cluster, 1):
                session.add(Cluster(id=1, name="test-cluster"))
            await session.commit()

    loop = asyncio.new_event_loop()
    loop.run_until_complete(_setup())

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _get_db_override():
        async with session_factory() as session:
            try:
                yield session
            finally:
                await session.close()

    with isolated_app_lifespan():
        _fastapi_app.dependency_overrides[get_db] = _get_db_override
        with TestClient(_fastapi_app) as client:
            yield client
        _fastapi_app.dependency_overrides.clear()

    loop.run_until_complete(engine.dispose())
    loop.close()


# ---------------------------------------------------------------------------
# async_isolated_client: 隔离的 httpx AsyncClient fixture
# ---------------------------------------------------------------------------
# 用于使用 httpx.AsyncClient(ASGITransport(app=app)) 的异步测试文件。
# get_db override 对 AsyncClient 同样有效（ASGI transport 走 FastAPI DI）。
#
# 用法：
#   async def test_something(self, async_isolated_client):
#       resp = await async_isolated_client.get("/api/v1/...")
#       assert resp.status_code == 200
# ---------------------------------------------------------------------------
import httpx as _httpx


@pytest.fixture(scope="function")
async def async_isolated_client():
    """创建隔离的 httpx.AsyncClient，内存库 + lifespan stub。"""
    from app.core.security import hash_password
    from app.models.user import User

    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    event.listen(engine.sync_engine, "connect", _enable_sqlite_fk)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        if not await session.get(User, 1):
            session.add(User(
                id=1, username="admin",
                password_hash=hash_password("panshi123"),
                role="admin",
            ))
        if not await session.get(Cluster, 1):
            session.add(Cluster(id=1, name="test-cluster"))
        await session.commit()

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _get_db_override():
        async with session_factory() as session:
            try:
                yield session
            finally:
                await session.close()

    with isolated_app_lifespan():
        _fastapi_app.dependency_overrides[get_db] = _get_db_override
        transport = _httpx.ASGITransport(app=_fastapi_app)
        async with _httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            # 将 session_factory 挂到 client 上，供需要直接操作 DB 的测试使用
            client._session_factory = session_factory
            yield client
        _fastapi_app.dependency_overrides.clear()

    await engine.dispose()


@pytest.fixture(scope="function")
def isolated_session(async_isolated_client):
    """从 async_isolated_client 的 engine 创建 session factory，供测试播种/查询。

    用法：
        async def test_something(async_isolated_client, isolated_session):
            async with isolated_session() as s:
                s.add(MyModel(...))
                await s.commit()
            resp = await async_isolated_client.get(...)
    """
    return async_isolated_client._session_factory


@pytest.fixture(scope="function")
async def async_authed_client(async_isolated_client):
    """async_isolated_client + 自动登录 admin，请求自带 Authorization 头。

    用法与 async_isolated_client 相同，但无需手动 login：
        async def test_something(async_authed_client):
            resp = await async_authed_client.get("/api/v1/...")
    """
    c = async_isolated_client
    login = await c.post("/api/v1/auth/login",
                         json={"username": "admin", "password": "panshi123"})
    assert login.status_code == 200, f"登录失败: {login.text}"
    c.headers["Authorization"] = f"Bearer {login.json()['access_token']}"
    return c
