## MODIFIED Requirements

### Requirement: Isolated Test Harness
The backend test suite SHALL use isolated databases with zero dependency on the real active database (`db_config.json` active connection) **for every test — not only for tests that opt into isolation fixtures**.

The isolation SHALL be enforced by a session-scoped global engine redirect performed at `conftest` import time: `app.core.database` 的全局异步引擎、会话工厂与同步引擎工厂 SHALL be pinned to a session-scoped temporary SQLite file, so that 未使用夹具的测试、以及触发应用 lifespan（`init_db`）的测试 equally target the isolated database.

#### Scenario: Test does not touch real database
- **WHEN** any test executes any database operation (via fixtures, via a bare `TestClient(app)`, or via an application lifespan startup)
- **THEN** all operations target the session-scoped temporary SQLite file created by conftest (`sqlite+aiosqlite:///<tmp>/isolated.db`), never the real active connection

#### Scenario: Lifespan does not connect to real DB
- **WHEN** a test triggers `app.main.lifespan` startup (without `isolated_app_lifespan()` stub)
- **THEN** `init_db()` SHALL create schema and run migrations only against the isolated database, because `create_sync_engine` is redirected as well

#### Scenario: Engine cleanup after session
- **WHEN** the test session completes (pass or fail)
- **THEN** the global isolated engine is disposed and its temporary directory removed

### Requirement: No Real Database Writes
The test suite SHALL NOT perform any write operation against the real active database, **including when the active connection is PostgreSQL**.

#### Scenario: Real DB untouched during full run
- **WHEN** `uv run pytest -q` completes against an active PostgreSQL connection
- **THEN** the real database's audit log (`sys_audit_log`) SHALL contain no entries produced by the test run, and no temporary test database directory SHALL remain on disk

#### Scenario: Full suite is runnable on PostgreSQL active connection
- **WHEN** the active connection is PostgreSQL (asyncpg)
- **THEN** the full suite SHALL complete without cross-event-loop connection reuse errors (`InterfaceError: another operation is in progress`), because the isolated engine uses `NullPool` and per-checkout connections

## ADDED Requirements

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

## REMOVED Requirements

### Requirement: Per-File Migration
**Reason**: 逐文件迁移路线要求持续手工改造（归档时仍有 45 个文件绑定真实库，且新测试默认回退），成本高且不闭环。
**Migration**: 由新增的 **Global Engine Redirect** 需求取代——单点在 conftest 强制重定向，未迁移文件零改造即被覆盖；既有夹具与已迁移文件继续有效。
