# Test Harness

## Purpose

Provides an isolated test harness for the backend pytest suite: a session-scoped global engine
redirect (performed at `conftest` import time) pins the application's engines, session factories and
synchronous engine factory to an isolated database, so every test — including tests that never opt
into isolation fixtures and tests that trigger the application lifespan — has zero dependency on the
real active database. The isolation backend is a temporary SQLite file by default, or a family of
dedicated PostgreSQL schemas when `TEST_DB_BACKEND=pg` (see PG Dialect Verification Mode).

## Requirements

### Requirement: Isolated Test Harness
The backend test suite SHALL use isolated databases with zero dependency on the real active database (`db_config.json` active connection) **for every test — not only for tests that opt into isolation fixtures**.

The isolation SHALL be enforced by a session-scoped global engine redirect performed at `conftest` import time: `app.core.database` 的全局异步引擎、会话工厂与同步引擎工厂 SHALL be pinned to a session-scoped isolated database, so that 未使用夹具的测试、以及触发应用 lifespan（`init_db`）的测试 equally target the isolated database. 隔离库默认是临时 SQLite 文件；`TEST_DB_BACKEND=pg` 时 SHALL 改为真实 PostgreSQL 的**夹具族 schema 组**（见 PG Dialect Verification Mode）。

#### Scenario: Test does not touch real database
- **WHEN** any test executes any database operation (via fixtures, via a bare `TestClient(app)`, or via an application lifespan startup)
- **THEN** all operations target the session-scoped temporary SQLite file created by conftest (`sqlite+aiosqlite:///<tmp>/isolated.db`), never the real active connection

#### Scenario: Lifespan does not connect to real DB
- **WHEN** a test triggers `app.main.lifespan` startup (without `isolated_app_lifespan()` stub)
- **THEN** `init_db()` SHALL create schema and run migrations only against the isolated database, because `create_sync_engine` is redirected as well

#### Scenario: Engine cleanup after session
- **WHEN** the test session completes (pass or fail)
- **THEN** the global isolated engine is disposed and its temporary directory removed

#### Scenario: Engine cleanup after test
- **WHEN** the test completes (pass or fail)
- **THEN** the per-test engine is disposed and all dependency overrides are cleared

#### Scenario: Fixture families do not clobber each other
- **WHEN** 同一测试使用多个数据库夹具（`test_db`、`isolated_app`、`async_isolated_client`、全局引擎）
- **THEN** 各夹具 SHALL 各自绑定独立的族 schema（族间互不可见，等价于 SQLite 模式下的独立内存库），任何夹具的每用例复位不得清除其他夹具的种子数据

### Requirement: Core Seed Data
Every isolated test session SHALL start with a minimal deterministic seed that covers the most common foreign-key dependencies.

#### Scenario: Admin user available
- **WHEN** a test needs an authenticated user
- **THEN** User(id=1, username="admin", is_admin=true, is_active=true) exists in the isolated database

#### Scenario: Cluster available
- **WHEN** a test needs a cluster parent record
- **THEN** Cluster(id=1, name="test-cluster") exists in the isolated database

### Requirement: Sync Client Fixture
The conftest SHALL provide an `isolated_app` fixture returning a sync `AuthedTestClient` with auto-login and Authorization headers pre-configured.

#### Scenario: Authenticated sync requests
- **WHEN** a test calls `client.get("/api/v1/some-endpoint")`
- **THEN** the request is sent through the ASGI app with auth headers injected and database operations land on the isolated in-memory engine

### Requirement: Async Client Fixture
The conftest SHALL provide an `async_isolated_client` fixture returning an `httpx.AsyncClient` with `ASGITransport` and auto-login, for tests that require async request handling.

#### Scenario: Authenticated async requests
- **WHEN** an async test calls `await client.get("/api/v1/some-endpoint")`
- **THEN** the request is sent through the ASGI app with auth headers and database operations land on the isolated in-memory engine

### Requirement: Unauthenticated Client Fixture
The conftest SHALL provide an `unauthenticated_app` fixture returning a sync `TestClient` with isolated database but WITHOUT auto-login, for testing 401/403 rejection paths.

#### Scenario: Unauthenticated request rejected
- **WHEN** a test uses `unauthenticated_app` and calls a secured endpoint
- **THEN** the response status is 401 (not 200) because no Authorization header is attached

### Requirement: Dual-DB Conflict Prevention
Tests SHALL NOT simultaneously use `isolated_app` and `test_db` fixtures, as they create separate databases.

#### Scenario: Single database per test
- **WHEN** a test needs both API calls and direct session access
- **THEN** the session must come from the same engine as the API client (via `isolated_session` fixture or the `isolated_app`'s session factory), not from `test_db`

### Requirement: Global Engine Redirect
The conftest SHALL redirect the application's global database engine, session factory and synchronous engine factory to a session-scoped isolated database at import time, and SHALL sweep stale by-value import references.

#### Scenario: By-value imports are swept
- **WHEN** a module imported the real session factory by value (`from app.core.database import AsyncSessionLocal`) before or after the redirect
- **THEN** the conftest SHALL replace that module attribute (by object identity) so no code path can reach the real database

#### Scenario: Engine reload cannot escape isolation
- **WHEN** tested code calls `_reload_active_engine()` (database switch flows)
- **THEN** the engine SHALL remain pinned to the isolated database (the reload helper is neutralized in tests)

#### Scenario: Minimal deterministic seed
- **WHEN** the isolated session database is created
- **THEN** it SHALL contain `User(id=1, username="admin")` and `Cluster(id in (1,2,3))`, and tests requiring other data SHALL seed it themselves

### Requirement: Real Implementation Access Fixture
The conftest SHALL provide a fixture exposing the pre-redirect real implementation of `create_sync_engine` for tests that must assert the production engine-builder behavior.

#### Scenario: Engine builder test
- **WHEN** a test asserts that `create_sync_engine()` follows the active configuration
- **THEN** it SHALL obtain the real function via the `real_create_sync_engine` fixture instead of the redirected module attribute

### Requirement: PG Dialect Verification Mode
隔离库默认 SQLite，会失去 PostgreSQL 严格类型/方言信号；系统 SHALL 提供显式 opt-in 的方式，使测试在真实 PostgreSQL 上运行且不触碰既有 schema。

#### Scenario: Backend selection is explicit
- **WHEN** 设置 `TEST_DB_BACKEND=pg`
- **THEN** 全局隔离引擎 SHALL 指向 PostgreSQL，所有连接的 `search_path` SHALL 固定为各自族 schema 且**不得包含 `public` 兜底**（缺表必须报错，而非回退解析到 public 真实表）

#### Scenario: Missing PostgreSQL target fails fast
- **WHEN** `TEST_DB_BACKEND=pg` 且既无 `PG_DSN` 也无活动 PG 连接
- **THEN** 测试会话 SHALL 显式报错，不得静默回退 SQLite

#### Scenario: Dedicated schema lifecycle keeps existing data intact
- **WHEN** PG 模式会话开始与结束
- **THEN** SHALL 仅重建并最终 `DROP SCHEMA ... CASCADE` 专用 schema，`public` 中的既有表与数据不得改变

#### Scenario: Isolation backend is observable
- **WHEN** 用例读取 `test_db_backend` 与 `global_engine_dialect` 夹具
- **THEN** 两者 SHALL 一致地反映实际隔离后端（`pg` ↔ `postgresql`，否则 `sqlite`）

#### Scenario: Family templates are built at import time
- **WHEN** PG 模式下 conftest 被导入
- **THEN** 全部族 schema SHALL 在导入期重建并完成建表（`global` 族走生产 `init_db()` 建表+迁移，DDL 经 `Base.metadata.schema` 显式限定），使模板成本不占用例超时预算

#### Scenario: Per-test reset aligns sequences
- **WHEN** 夹具以显式 id 种子（如 `Cluster(id=1..3)`、`User(id=1)`）准备数据
- **THEN** 种子后 SHALL 将该族 schema 的全部序列对齐到 `max(id)+1`（显式 id 不推进 PG 序列，不复位则 API 创建的首行撞主键）

#### Scenario: Sync client get_db uses per-request sessions
- **WHEN** 测试把 get_db override 提供给同步 `TestClient`/`AuthedTestClient`
- **THEN** override SHALL 用会话工厂**每请求新开会话**，不得复用异步夹具的 session 对象（asyncpg 连接绑定创建它的 loop）

### Requirement: No Real Database Writes
The test suite SHALL NOT perform any write operation against the real active database, **including when the active connection is PostgreSQL**.

#### Scenario: Real DB untouched during test run
- **WHEN** `uv run pytest --tb=short -q` completes
- **THEN** no SQLite WAL files are modified for the real database and no `database is locked` errors appear

#### Scenario: Real DB untouched during full run
- **WHEN** `uv run pytest -q` completes against an active PostgreSQL connection
- **THEN** the real database's audit log (`sys_audit_log`) SHALL contain no entries produced by the test run, and no temporary test database directory SHALL remain on disk

#### Scenario: Full suite is runnable on PostgreSQL active connection
- **WHEN** the active connection is PostgreSQL (asyncpg)
- **THEN** the full suite SHALL complete without cross-event-loop connection reuse errors (`InterfaceError: another operation is in progress`), because the isolated engine uses `NullPool` and per-checkout connections

#### Scenario: Zero-pollution guard fails the session on any public write
- **WHEN** PG 模式会话结束（无论通过与否）
- **THEN** conftest SHALL 对 `public` 全表做行数快照对比，任何与首拍不一致的表 SHALL 使会话以显式错误收场并列出差异
