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


# ===========================================================================
# 全局测试引擎重定向（2026-09-17）
# ===========================================================================
# 背景：活动库切 PostgreSQL 后，未使用隔离夹具的测试会直连真实活动库：
#   · asyncpg 不容忍跨事件循环复用连接 → 全量跑 102 failed（71 次登录即
#     InterfaceError: another operation is in progress）
#   · 直连真实库意味着测试可能写入真实数据（安全隐患）
#
# 方案：conftest 导入期把 app.core.database 的全局引擎/会话工厂**单点**
# 重定向到会话级临时 SQLite 文件，并清扫"按值导入"产生的陈旧引用。
# 此后任何测试（含尚未迁移到 isolated_app 夹具的文件）都命中隔离库。
#
# 关键细节：
#   · NullPool：pytest-asyncio auto 模式下每个测试用例独立事件循环，
#     池化连接跨 loop 复用会报 "attached to a different loop"。
#   · 临时文件而非 :memory:：多个连接/线程（TestClient portal）需共享同一库。
#   · _reload_active_engine 置空：防止切换库类测试把引擎重新指回真实配置。
# 后端选择（默认 sqlite）：
#   · TEST_DB_BACKEND=sqlite（默认）→ 会话级临时 SQLite 文件
#   · TEST_DB_BACKEND=pg → 真实 PostgreSQL 的**专用 schema**（默认 pan shi_test，
#     可用 TEST_DB_PG_SCHEMA 覆盖；会话结束 DROP SCHEMA CASCADE，public 不动），
#     用于 PG 严格类型/方言回归。DSN 取 PG_DSN，未设时取活动 PG 连接。
#     pg 模式下若两者都不可得 → 直接报错（不静默回退 SQLite，避免虚假的"PG 通过"信号）。
import os
import shutil
import sys
import tempfile

from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool, StaticPool

TEST_DB_BACKEND = os.environ.get("TEST_DB_BACKEND", "sqlite").strip().lower()
PG_TEST_SCHEMA = os.environ.get("TEST_DB_PG_SCHEMA", "panshi_test")
_USING_PG = TEST_DB_BACKEND == "pg"

TEST_DB_DIR = tempfile.mkdtemp(prefix="panshi-test-db-")
TEST_DB_PATH = os.path.join(TEST_DB_DIR, "isolated.db")
TEST_DB_SYNC_URL = f"sqlite:///{TEST_DB_PATH}"
TEST_DB_ASYNC_URL = f"sqlite+aiosqlite:///{TEST_DB_PATH}"
TEST_DB_LABEL = f"sqlite 临时文件 {TEST_DB_PATH}"

import app.core.database as _app_db_module

_REAL_SESSION_FACTORY = _app_db_module.AsyncSessionLocal
_REAL_ASYNC_ENGINE = _app_db_module._async_engine
_REAL_CREATE_SYNC_ENGINE = _app_db_module.create_sync_engine


def _resolve_pg_urls() -> tuple[str, str]:
    """(sync_url, async_url)：优先 PG_DSN，其次活动 PG 连接，否则报错。"""
    dsn = os.environ.get("PG_DSN", "").strip()
    if dsn:
        base = dsn.split("://", 1)[-1]
        return f"postgresql+psycopg2://{base}", f"postgresql+asyncpg://{base}"
    conn = _app_db_module.get_active_connection()
    if conn is not None and getattr(conn, "type", "") in ("postgres", "postgresql"):
        from app.core.db_config import build_async_engine_url, build_engine_url

        return build_engine_url(conn), build_async_engine_url(conn)
    raise RuntimeError(
        "TEST_DB_BACKEND=pg 需要 PG_DSN 或活动 PG 连接（db_config.json active=postgresql）；"
        "拒绝静默回退 SQLite（否则会给出虚假的『PG 已通过』信号）。"
    )


if _USING_PG:
    _PG_SYNC_URL, _PG_ASYNC_URL = _resolve_pg_urls()
    TEST_DB_LABEL = f"PostgreSQL schema={PG_TEST_SCHEMA}"

    def _new_test_sync_engine():
        return create_engine(
            _PG_SYNC_URL,
            connect_args={"options": f"-csearch_path={PG_TEST_SCHEMA},public"},
        )

    _GLOBAL_TEST_ENGINE = create_async_engine(
        _PG_ASYNC_URL,
        echo=False,
        poolclass=NullPool,
        connect_args={"server_settings": {"search_path": f"{PG_TEST_SCHEMA},public"}},
    )
else:

    def _new_test_sync_engine():
        eng = create_engine(
            TEST_DB_SYNC_URL,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        event.listen(eng, "connect", _enable_sqlite_fk)
        return eng

    _GLOBAL_TEST_ENGINE = create_async_engine(TEST_DB_ASYNC_URL, echo=False, poolclass=NullPool)
    event.listen(_GLOBAL_TEST_ENGINE.sync_engine, "connect", _enable_sqlite_fk)

_GLOBAL_TEST_SESSION_FACTORY = async_sessionmaker(
    _GLOBAL_TEST_ENGINE, class_=AsyncSession, expire_on_commit=False
)


def _pin_test_engine():
    """把 app.core.database 的全局引擎/会话工厂钉到隔离库。"""
    _app_db_module._async_engine = _GLOBAL_TEST_ENGINE
    _app_db_module.AsyncSessionLocal = _GLOBAL_TEST_SESSION_FACTORY
    _app_db_module.create_sync_engine = _new_test_sync_engine
    _app_db_module._active_async_engine = lambda: _GLOBAL_TEST_ENGINE
    _app_db_module._reload_active_engine = lambda: None


def _sweep_stale_engine_refs():
    """清扫 `from app.core.database import AsyncSessionLocal` 等按值导入的陈旧引用。

    按值导入在导入时刻绑定对象，模块级 patch 无法覆盖，必须按身份逐一替换。
    """
    for mod in list(sys.modules.values()):
        if mod is None:
            continue
        if getattr(mod, "AsyncSessionLocal", None) is _REAL_SESSION_FACTORY:
            mod.AsyncSessionLocal = _GLOBAL_TEST_SESSION_FACTORY
        if getattr(mod, "_async_engine", None) is _REAL_ASYNC_ENGINE:
            mod._async_engine = _GLOBAL_TEST_ENGINE
        if getattr(mod, "create_sync_engine", None) is _REAL_CREATE_SYNC_ENGINE:
            mod.create_sync_engine = _new_test_sync_engine


_pin_test_engine()


@pytest.fixture(scope="session", autouse=True)
def _isolated_real_db_redirect():
    """会话级：建隔离库 schema + 最小种子，并清扫导入期后产生的陈旧引用。

    sqlite 模式：临时文件建表 + 种子。
    pg 模式：在目标 PG 上重建专用 schema → 走生产 `init_db()`（create_all + 迁移）
    → 种子兜底；会话结束 DROP SCHEMA CASCADE（public 不动）。
    """
    from app.core.security import hash_password
    from app.models.user import User

    _pin_test_engine()
    _sweep_stale_engine_refs()

    async def _seed():
        async with _GLOBAL_TEST_SESSION_FACTORY() as session:
            if not await session.get(User, 1):
                session.add(
                    User(
                        id=1,
                        username="admin",
                        password_hash=hash_password("panshi123"),
                        role="admin",
                    )
                )
            for cid in SEED_CLUSTER_IDS:
                if not await session.get(Cluster, cid):
                    session.add(Cluster(id=cid, name=f"seed-cluster-{cid}"))
            await session.commit()

    async def _setup_sqlite():
        async with _GLOBAL_TEST_ENGINE.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    loop = asyncio.new_event_loop()
    try:
        if _USING_PG:
            sync_engine = _new_test_sync_engine()
            with sync_engine.begin() as conn:
                conn.execute(text(f'DROP SCHEMA IF EXISTS "{PG_TEST_SCHEMA}" CASCADE'))
                conn.execute(text(f'CREATE SCHEMA "{PG_TEST_SCHEMA}"'))
            sync_engine.dispose()
            # 生产启动路径：create_all + run_migrations 全部落在专用 schema 内
            loop.run_until_complete(_app_db_module.init_db())
        else:
            loop.run_until_complete(_setup_sqlite())
        loop.run_until_complete(_seed())
    finally:
        loop.close()

    print(f"\n[conftest] 测试隔离库：{TEST_DB_LABEL}")

    yield

    _pin_test_engine()
    asyncio.run(_GLOBAL_TEST_ENGINE.dispose())
    if _USING_PG:
        sync_engine = _new_test_sync_engine()
        with sync_engine.begin() as conn:
            conn.execute(text(f'DROP SCHEMA IF EXISTS "{PG_TEST_SCHEMA}" CASCADE'))
        sync_engine.dispose()
    else:
        shutil.rmtree(TEST_DB_DIR, ignore_errors=True)


@pytest.fixture(scope="session")
def test_db_backend() -> str:
    """当前测试隔离后端：'sqlite' | 'pg'（方言守卫用例可据此断言运行模式）。"""
    return TEST_DB_BACKEND


@pytest.fixture(scope="session")
def global_engine_dialect() -> str:
    """会话级全局隔离引擎的方言名（'sqlite' / 'postgresql'）。"""
    return _GLOBAL_TEST_ENGINE.dialect.name


@pytest.fixture
def global_engine_client():
    """绑定**会话级全局隔离引擎**的已鉴权客户端（不覆盖 get_db）。

    与 `isolated_app` 的差别：后者使用 per-test 内存库；本夹具直接打全局隔离库——
    sqlite 模式下是临时文件库，pg 模式下是 PG 专用 schema。用于方言/严格类型回归
    （见 `tests/test_pg_dialect_smoke.py`）。
    """
    from app.main import app as _fastapi_app

    from tests.api_helpers import AuthedTestClient, isolated_app_lifespan

    with isolated_app_lifespan():
        with AuthedTestClient(_fastapi_app) as client:
            yield client

@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.fixture
def real_create_sync_engine():
    """真实 create_sync_engine（全局重定向会替换模块属性，验证真实行为时显式取回）。"""
    return _REAL_CREATE_SYNC_ENGINE


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
