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
    # ── 夹具族 schema（2026-09-18）──────────────────────────────────
    # 同一测试内多个 DB 夹具若共享一个 schema，后一个夹具的 truncate 会清掉
    # 前一个夹具的种子（92× ps_cluster_pkey 等大面积失败的根因）。族间互不可见，
    # 完全复刻 sqlite 模式"每夹具独立内存库"的语义。
    PG_TEST_SCHEMA = "panshi_test"      # global 族：全局引擎（未迁移文件/冒烟，跨用例共享基线）
    _PG_FAMILY_SCHEMAS = {
        "global": PG_TEST_SCHEMA,
        "test_db": "panshi_test_td",    # test_db 夹具
        "app": "panshi_test_app",       # isolated_app / unauthenticated_app
        "async": "panshi_test_async",   # async_isolated_client 一族
        "misc": "panshi_test_misc",     # 测试文件自建客户端（默认族）
    }
    TEST_DB_LABEL = f"PostgreSQL schemas={sorted(set(_PG_FAMILY_SCHEMAS.values()))}"

    def _new_test_sync_engine(schema=None):
        return create_engine(
            _PG_SYNC_URL,
            connect_args={"options": f"-csearch_path={schema or PG_TEST_SCHEMA}"},
        )

    def _pg_async_engine(schema):
        return create_async_engine(
            _PG_ASYNC_URL,
            echo=False,
            poolclass=NullPool,
            connect_args={"server_settings": {"search_path": schema}},
        )

    _GLOBAL_TEST_ENGINE = _pg_async_engine(PG_TEST_SCHEMA)

    _PG_FAMILY_ENGINES = {}

    def _pg_family(schema):
        """懒建族引擎（异步引擎 + 会话工厂）。"""
        if schema not in _PG_FAMILY_ENGINES:
            eng = _pg_async_engine(schema)
            _PG_FAMILY_ENGINES[schema] = (
                eng,
                async_sessionmaker(eng, class_=AsyncSession, expire_on_commit=False),
            )
        return _PG_FAMILY_ENGINES[schema]
else:

    def _new_test_sync_engine(schema=None):
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

    注意两道防线（2026-09-18 教训）：
    ① 引擎 search_path **不含 public 兜底**——否则 create_all 的 has_table 未命中
       时，无 schema 限定的 INSERT 会经 search_path 回退解析到 public 真实表；
    ② 会话 setup 前必须 `import app.main` 注册**全部**模型，否则 metadata 只有
       conftest 顶部导入的少数模型，init_db 只建了部分表，其余表同样回退 public。
    """
    import app.main  # noqa: F401 —— 注册全部 ORM 模型（保证 create_all 建全 23 张表）

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
        if not _USING_PG:
            loop.run_until_complete(_setup_sqlite())
        # PG 模式：族模板已在**导入期**建好（_build_pg_templates），此处仅种子。
        loop.run_until_complete(_seed())
        if _USING_PG:
            _pg_reset_sequences(PG_TEST_SCHEMA)  # 显式 id 种子不推进序列，必须对齐
    finally:
        loop.close()

    print(f"\n[conftest] 测试隔离库：{TEST_DB_LABEL}")

    _public_guard_before = _pg_public_row_snapshot() if _USING_PG else {}

    yield

    _pin_test_engine()
    asyncio.run(_GLOBAL_TEST_ENGINE.dispose())
    if _USING_PG:
        # ── 真实库零污染守卫（2026-09-18 事故防线）──────────────────────
        # 一旦测试会话写动了 public 任何一行，这里立即失败并给出差异表，
        # 绝不允许"测试悄悄写了真实库"静默发生。
        _public_guard_after = _pg_public_row_snapshot()
        diff = {
            t: (b, a)
            for t, b in _public_guard_before.items()
            for a in (_public_guard_after.get(t),)
            if a != b
        }
        if diff:
            details = "\n".join(f"  public.{t}: {b} -> {a}" for t, (b, a) in diff.items())
            raise RuntimeError(
                "PG 测试会话污染了 public 真实数据！行数差异：\n" + details
            )
        for sch, (eng, _f) in _PG_FAMILY_ENGINES.items():
            try:
                asyncio.run(eng.dispose())
            except Exception:
                pass
        sync_engine = _new_test_sync_engine()
        with sync_engine.begin() as conn:
            for sch in set(_PG_FAMILY_SCHEMAS.values()):
                conn.execute(text(f'DROP SCHEMA IF EXISTS "{sch}" CASCADE'))
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


# ---------------------------------------------------------------------------
# 后端感知的"每用例干净库"助手（2026-09-17）
# ---------------------------------------------------------------------------
# 需求：SQLite 与 PostgreSQL 两个后端下，**全部用例都必须真实打在目标库上**
# （否则 PG 严格类型/方言问题在夹具用例中被内存 SQLite 掩盖）。
#
#   · sqlite 模式：每用例新建内存库（既有行为，天然干净）
#   · pg 模式：复用会话级全局 PG 引擎（同一专用 schema），每用例开始
#     `TRUNCATE ... RESTART IDENTITY CASCADE` + 复位序列——毫秒级，
#     比"每用例建 schema + create_all"便宜两个数量级；随后由各夹具自己的
#     种子代码补齐所需数据（保持与 SQLite 模式一致的数据基线）。
_PG_RESET_SEQUENCES_SQL = """DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = current_schema() LOOP
    BEGIN
      IF pg_get_serial_sequence(quote_ident(t), 'id') IS NOT NULL THEN
        EXECUTE 'SELECT setval(pg_get_serial_sequence('
                || quote_literal(quote_ident(t))
                || ', ''id''), COALESCE((SELECT MAX(id) FROM '
                || quote_ident(t)
                || '), 0) + 1, false)';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END $$;"""
# 注意：DO 块内禁用 format('%I'/'%L')——SQLAlchemy 会把空参数字典传给 psycopg2，
# 触发 % 插值报 "immutabledict is not a sequence"，故统一用 quote_ident/quote_literal 拼接。


def _create_all_sync(schema: str) -> None:
    """在指定族 schema 上同步建全表模板（会话期一次；显式限定 schema）。"""
    eng = _new_test_sync_engine(schema)
    try:
        Base.metadata.schema = schema
        try:
            with eng.begin() as conn:
                Base.metadata.create_all(conn)
        finally:
            Base.metadata.schema = None
    finally:
        eng.dispose()


if _USING_PG:
    # ── 导入期建族模板（2026-09-18）────────────────────────────────────
    # 该 PG 实例的存储对关系文件强制 fsync（DataFileImmediateSync），每条
    # DDL 秒级、全套模板 40-70s。放**导入期**执行：pytest-timeout 按"用例"
    # 计时，导入期工作不占任何用例的 90s 预算，也不会连带首个用例超时。
    import app.main  # noqa: F401 —— 注册全部 ORM 模型

    def _build_pg_templates() -> None:
        eng = _new_test_sync_engine()
        try:
            with eng.begin() as conn:
                for sch in set(_PG_FAMILY_SCHEMAS.values()):
                    conn.execute(text(f'DROP SCHEMA IF EXISTS "{sch}" CASCADE'))
                    conn.execute(text(f'CREATE SCHEMA "{sch}"'))
        finally:
            eng.dispose()
        for sch in set(_PG_FAMILY_SCHEMAS.values()):
            if sch == PG_TEST_SCHEMA:
                Base.metadata.schema = sch
                try:
                    asyncio.run(_app_db_module.init_db())
                finally:
                    Base.metadata.schema = None
            else:
                _create_all_sync(sch)

    _build_pg_templates()


async def _create_all_on(engine):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


def _public_row_snapshot_sync_conn():
    """独立 public 连接（search_path 显式 public，与隔离引擎无关）。"""
    return create_engine(_PG_SYNC_URL, connect_args={"options": "-csearch_path=public"})


def _pg_public_row_snapshot() -> dict:
    """public 全表行数快照（PG 模式专用守卫）。"""
    eng = _public_row_snapshot_sync_conn()
    try:
        with eng.connect() as conn:
            rows = conn.execute(text(
                "select tablename from pg_tables where schemaname='public' order by 1"
            )).fetchall()
            return {
                t: conn.execute(text(f'select count(*) from public."{t}"')).scalar()
                for (t,) in rows
            }
    finally:
        eng.dispose()


def _pg_truncate_schema(schema: str) -> None:
    """清空指定族 schema 内全部模型表并复位序列（PG 模式每用例重置）。

    用单 roundtrip 的多语句 DELETE（实测 0.1s）而非 TRUNCATE——本 PG 实例上
    TRUNCATE 触发 DataFileImmediateSync 强制刷盘，单次 13-20s，对 900+ 夹具
    用例完全不可用。DELETE 须按子表→父表逆拓扑序执行（sorted_tables 为父→子）。
    DELETE 不重置序列，故补 DO 块按 max(id)+1 复位，保持与"全新空库"一致的
    id 语义（对齐 SQLite 模式每用例全新内存库的行为）。
    """
    tables = [f'"{t.name}"' for t in reversed(Base.metadata.sorted_tables)]
    if not tables:
        return
    stmt = "; ".join(f"DELETE FROM {n}" for n in tables) + ";"
    engine = _new_test_sync_engine(schema)
    try:
        with engine.begin() as conn:
            conn.exec_driver_sql(stmt)
    finally:
        engine.dispose()
    _pg_reset_sequences(schema)


def _pg_reset_sequences(schema: str) -> None:
    """把 schema 内全部序列对齐到 max(id)+1（显式 id 种子不推进 PG 序列，
    不复位则 API 创建的首行会撞种子——SQLite 的 rowid 分配天然免疫）。"""
    engine = _new_test_sync_engine(schema)
    try:
        with engine.begin() as conn:
            conn.exec_driver_sql(_PG_RESET_SEQUENCES_SQL)
    finally:
        engine.dispose()


def _isolated_engine_factory(family: str = "misc"):
    """返回 (engine, session_factory, async_teardown)，并按后端做每用例重置。

    pg 模式按夹具族分 schema：只清自己族，族间互不可见（语义=sqlite 的独立
    内存库）；sqlite 模式每用例新建内存库。family 缺省 "misc"——测试文件
    自建客户端的安全兜底族，绝不触碰 global 族（那里有会话级种子基线）。
    """
    if _USING_PG:
        schema = _PG_FAMILY_SCHEMAS[family]
        engine, factory = _pg_family(schema)
        _pg_truncate_schema(schema)

        async def _teardown_pg():
            return None

        return engine, factory, _teardown_pg

    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    event.listen(engine.sync_engine, "connect", _enable_sqlite_fk)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _teardown_sqlite():
        await engine.dispose()

    return engine, factory, _teardown_sqlite


async def _prepare_isolated_db(engine):
    """sqlite 模式建表；pg 模式 schema 已由会话夹具建好（仅需已完成的清空）。"""
    if not _USING_PG:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)


@pytest.fixture(scope="function")
async def test_db_factory():
    """test_db 同库的**会话工厂**（同一隔离库，每用例独立 schema/内存库）。

    供"同步 TestClient + 直接 DB 断言"混用的测试：get_db override 必须用工厂
    每请求新开会话（在客户端自己的 loop 里），不得把 test_db 的会话对象直接
    塞给同步客户端——asyncpg 连接绑定创建它的 loop，跨 loop close 会
    RuntimeError/泄漏连接（2026-09-18，PG 模式实测）。
    """
    engine, async_session, teardown = _isolated_engine_factory("test_db")
    await _prepare_isolated_db(engine)

    async with async_session() as session:
        for cid in SEED_CLUSTER_IDS:
            existing = await session.get(Cluster, cid)
            if existing is None:
                session.add(Cluster(id=cid, name=f"seed-cluster-{cid}"))
        await session.commit()
    if _USING_PG:
        _pg_reset_sequences(_PG_FAMILY_SCHEMAS["test_db"])

    yield async_session
    await teardown()


@pytest.fixture(scope="function")
async def test_db(test_db_factory):
    engine = None
    async with test_db_factory() as session:
        yield session


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
    - get_db override → 当前后端隔离库（sqlite：内存库；pg：专用 schema，每用例已清空）
    - 最小种子：admin(id=1) + cluster(id=1)
    """
    from app.core.security import hash_password
    from app.models.user import User

    engine, session_factory, teardown = _isolated_engine_factory("app")

    async def _setup():
        await _prepare_isolated_db(engine)
        async with session_factory() as session:
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
        if _USING_PG:
            _pg_reset_sequences(_PG_FAMILY_SCHEMAS["app"])

    loop = asyncio.new_event_loop()
    loop.run_until_complete(_setup())

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

    loop.run_until_complete(teardown())
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
    engine, session_factory, teardown = _isolated_engine_factory("app")

    async def _setup():
        await _prepare_isolated_db(engine)
        async with session_factory() as session:
            if not await session.get(Cluster, 1):
                session.add(Cluster(id=1, name="test-cluster"))
            await session.commit()
        if _USING_PG:
            _pg_reset_sequences(_PG_FAMILY_SCHEMAS["app"])

    loop = asyncio.new_event_loop()
    loop.run_until_complete(_setup())

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

    loop.run_until_complete(teardown())
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
    """创建隔离的 httpx.AsyncClient（内存库 / PG 族 schema）+ lifespan stub。"""
    from app.core.security import hash_password
    from app.models.user import User

    engine, session_factory, teardown = _isolated_engine_factory("async")
    await _prepare_isolated_db(engine)
    async with session_factory() as session:
        if not await session.get(User, 1):
            session.add(User(
                id=1, username="admin",
                password_hash=hash_password("panshi123"),
                role="admin",
            ))
        if not await session.get(Cluster, 1):
            session.add(Cluster(id=1, name="test-cluster"))
        await session.commit()
    if _USING_PG:
        _pg_reset_sequences(_PG_FAMILY_SCHEMAS["async"])

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

    await teardown()


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
