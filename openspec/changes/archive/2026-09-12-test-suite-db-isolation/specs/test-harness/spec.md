## ADDED Requirements

### Requirement: Isolated Test Harness
The backend test suite SHALL use isolated in-memory SQLite databases per test, ensuring zero dependency on the real active database (`db_config.json` active connection).

#### Scenario: Test does not touch real database
- **WHEN** a test uses the `isolated_app` fixture (or any derivative conftest fixture)
- **THEN** all database operations target a per-test in-memory SQLite instance created by `create_async_engine("sqlite+aiosqlite:///:memory:")`

#### Scenario: Lifespan does not connect to real DB
- **WHEN** a test uses the `isolated_app` or `async_isolated_client` fixture
- **THEN** `app.main.lifespan` startup is stubbed via `isolated_app_lifespan()` — `init_db()`, `seed_data()`, and `recover_interrupted_tasks()` are patched out

#### Scenario: Engine cleanup after test
- **WHEN** the test completes (pass or fail)
- **THEN** the per-test engine is disposed and all dependency overrides are cleared

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

### Requirement: Per-File Migration
All test files that previously used `AuthedTestClient(app)` or `TestClient(app)` without `isolated_app_lifespan()` SHALL be migrated to use conftest isolation fixtures.

#### Scenario: No bare TestClient usage
- **WHEN** `grep -rLn "isolated_app" tests/test_*.py` runs
- **THEN** none of the resulting files contain `AuthedTestClient(app)` or `TestClient(app)` without a corresponding `isolated_app_lifespan()` context

#### Scenario: Zero database lock contention
- **WHEN** the full test suite runs (`uv run pytest -q`)
- **THEN** `grep -i "database is locked"` on stderr/stdout produces zero output

### Requirement: No Real Database Writes
The test suite SHALL NOT perform any write operation against the real active database.

#### Scenario: Real DB untouched during test run
- **WHEN** `uv run pytest --tb=short -q` completes
- **THEN** no SQLite WAL files are modified for the real database and no `database is locked` errors appear
