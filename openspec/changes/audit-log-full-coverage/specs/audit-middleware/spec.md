## ADDED Requirements

### Requirement: Router hook intercepts all /api/v1/ mutating requests
The system SHALL use FastAPI's `router.on_route` hook (triggered after route matching) to intercept every mutating request (POST/PUT/PATCH/DELETE) to `/api/v1/` paths and automatically create an `AuditLog` skeleton record. This ensures access to `request.path_params` for extracting route parameters like `cluster_id`, `route_id`.

#### Scenario: Request intercepted and skeleton created with path params
- **WHEN** a mutating request reaches any `/api/v1/` endpoint and route matching completes
- **THEN** hook creates `AuditLog` with `user_id`, `username`, `action`, `resource`, `resource_id` (extracted from `request.path_params`), `ip_address`, `created_at` (detail empty) and adds it to the session
- **THEN** the `AuditLog` object is attached to `request.state.audit` for downstream access

### Requirement: Automatic action/resource inference from HTTP method and route
The hook SHALL automatically infer `action` and `resource` from HTTP method and URL path using a route mapping table. Covers POST, PUT, PATCH, DELETE methods.

#### Scenario: DELETE /clusters/1/routes/14 → action=route_delete, resource=route
- **WHEN** request is `DELETE /api/v1/clusters/1/routes/14`
- **THEN** hook resolves mapping to `resource="route"`, `action="route_delete"`, `resource_id=14` (from `path_params`)

#### Scenario: POST /clusters/1/upstreams → action=upstream_create, resource=upstream
- **WHEN** request is `POST /api/v1/clusters/1/upstreams`
- **THEN** hook resolves mapping to `resource="upstream"`, `action="upstream_create"`, `resource_id=None` (to be backfilled)

#### Scenario: PUT /clusters/1/routes/14 → action=route_update, resource=route
- **WHEN** request is `PUT /api/v1/clusters/1/routes/14`
- **THEN** hook resolves mapping to `resource="route"`, `action="route_update"`, `resource_id=14`

#### Scenario: PATCH /clusters/1/routes/14 → action=route_patch, resource=route
- **WHEN** request is `PATCH /api/v1/clusters/1/routes/14`
- **THEN** hook resolves mapping to `resource="route"`, `action="route_patch"`, `resource_id=14`

### Requirement: Skip non-mutating and special requests
The hook SHALL skip GET, HEAD, OPTIONS requests, WebSocket upgrades, Server-Sent Events, and health check endpoints (`/api/v1/health`, `/api/v1/features`, `/api/v1/system/features`).

#### Scenario: GET request creates no audit log
- **WHEN** request is `GET /api/v1/clusters/1/routes`
- **THEN** hook does not create `AuditLog` (returns early)

#### Scenario: WebSocket upgrade skipped
- **WHEN** request has `Upgrade: websocket` header
- **THEN** hook does not create `AuditLog`

#### Scenario: Health check skipped
- **WHEN** request is `GET /api/v1/health`
- **THEN** hook does not create `AuditLog`

#### Scenario: Mapping table completeness
- **WHEN** application starts
- **THEN** all mutating routes in FastAPI app are present in the mapping table (startup validation)

### Requirement: Failed requests do not persist audit log
The system SHALL NOT persist audit log entries for failed requests (HTTP 4xx/5xx). The hook adds `AuditLog` to session; on exception, FastAPI's global exception handler triggers session rollback, naturally discarding the audit entry.

#### Scenario: 401 Unauthorized request
- **WHEN** request returns 401
- **THEN** the `AuditLog` added to session is rolled back with the transaction (no row in `sys_audit_log`)

#### Scenario: 500 Internal Server Error
- **WHEN** request raises unhandled exception
- **THEN** the `AuditLog` is rolled back with the transaction

### Requirement: Client IP extraction handles reverse proxy
The hook SHALL extract real client IP from `X-Forwarded-For` header when behind trusted proxy (configurable `TRUSTED_PROXIES` list).

#### Scenario: Request through nginx proxy
- **WHEN** request has `X-Forwarded-For: 203.0.113.195, 70.41.3.18`
- **THEN** hook records `ip_address="203.0.113.195"` (first non-proxy IP)

### Requirement: Batch operations marked in mapping table
The route mapping table SHALL support `is_batch=True` flag for batch endpoints. Body reading for batch ID extraction is done by the handler (not the hook) to avoid consuming the request stream.

#### Scenario: Batch delete routes
- **WHEN** request is `DELETE /api/v1/clusters/1/routes` with body `{ids: [14,15,16]}`
- **THEN** hook sets `resource_id=0`, `action="route_batch_delete"`
- **THEN** handler reads body, sets `detail = f"批量删除路由: [14, 15, 16] 共 3 条"`

### Requirement: Default detail template for unenriched operations
The system SHALL provide a default detail template for mutating operations where the handler does not explicitly enrich `detail`. The template is applied in the hook after the handler returns but before transaction commit, using `request.state.audit` fields.

#### Scenario: Handler skips detail enrichment
- **WHEN** handler returns success but never touches `request.state.audit.detail`
- **THEN** hook applies generic template: `{resource} {action} (id={resource_id})` (e.g., `"route route_delete (id=14)"`)
- **THEN** for batch operations: `{resource} batch_{action} (ids=[14,15,16])`