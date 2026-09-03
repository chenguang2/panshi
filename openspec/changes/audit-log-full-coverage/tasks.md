# Tasks for audit-log-full-coverage

## Phase 1: Middleware & Core Infrastructure

### [ ] 1.1 Create audit middleware
- File: `backend/app/middleware/audit_middleware.py`
- Implement `AuditMiddleware` class with `dispatch()` method
- Route mapping table: `ROUTE_MAP: dict[tuple[str, str], tuple[str, str, bool]]` — (method, path_pattern) → (resource, action, is_batch)
- Cover all mutating endpoints (~30 entries)
- Extract `user_id`, `username` from `request.state.user` (set by auth dependency)
- Extract IP: check `X-Forwarded-For` → `request.client.host`
- Create `AuditLog` skeleton, `db.add()`, attach to `request.state.audit`
- Skip GET/OPTIONS/HEAD requests
- Register middleware in `app/main.py` before auth middleware

### [ ] 1.2 Enhance log_audit() for same-object enrichment
- File: `backend/app/services/audit.py`
- Add `audit_obj: AuditLog | None = None` parameter to `log_audit()`
- If `audit_obj` provided: update its fields, return it
- If not: create new `AuditLog` (existing behavior)
- Update docstring and type hints

### [ ] 1.3 Add startup validation for route mapping completeness
- In `app/main.py` startup event: scan all routes, verify all mutating `/api/v1/` routes have mapping entry
- Log warning for missing mappings

### [ ] 1.4 Unit tests for middleware
- File: `backend/tests/test_audit_middleware.py`
- Test: middleware creates skeleton for DELETE/POST/PUT
- Test: action/resource inference from mapping table
- Test: IP extraction with/without X-Forwarded-For
- Test: failed request (4xx/5xx) rolls back audit log
- Test: batch endpoint detection

## Phase 2: Business Handler Enrichment (by domain)

### [ ] 2.1 Cluster domain — routes, upstreams, ssl, plugin_configs, global_rules, stream_proxies, dns_proxies, static_resources
- File: `backend/app/api/v1/cluster_routes.py` — enrich `detail` in create/update/delete
- File: `backend/app/api/v1/cluster_upstreams.py` — same
- File: `backend/app/api/v1/cluster_ssl.py` — same
- File: `backend/app/api/v1/cluster_plugin_configs.py` — same
- File: `backend/app/api/v1/cluster_global_rules.py` — same
- File: `backend/app/api/v1/cluster_stream_proxies.py` — same
- File: `backend/app/api/v1/cluster_dns_proxies.py` — same
- File: `backend/app/api/v1/cluster_static_resources.py` — same
- File: `backend/app/api/v1/cluster_nodes.py` — node create/update/delete

### [ ] 2.2 System domain — users, clickhouse_config, database, ansible_inventory
- File: `backend/app/api/v1/users.py` — enrich existing `delete_user` + add create/update/enable/disable/assign
- File: `backend/app/api/v1/clickhouse_config.py` — enrich create/update/delete/test
- File: `backend/app/api/v1/database.py` — enrich switch/migrate/export/import
- File: `backend/app/api/v1/ansible_inventory.py` — enrich save/parse

### [ ] 2.3 Edge sync / import domain
- File: `backend/app/api/v1/edge_client.py` — enrich node sync operations
- File: `backend/app/api/v1/edge_import.py` — enrich import execute

### [ ] 2.4 Node tasks / autostart
- File: `backend/app/api/v1/node_tasks.py` — enrich task create/cancel/retry/delete
- File: `backend/app/api/v1/cluster_autostart.py` — enrich enable/disable/status

### [ ] 2.5 Batch operation detail enrichment
- Identify batch endpoints (e.g., `DELETE /clusters/{id}/routes` with body)
- Add `detail` with ID list in handlers

## Phase 3: Frontend UI

### [ ] 3.1 Add feature flag & permission key
- `backend/features.yaml`: add `audit_log: true`
- `backend/app/core/features.py`: add `audit_log` to `KNOWN_FEATURES`
- `backend/app/api/deps.py`: add `system_audit` to permission registry
- `frontend/src/permission.ts`: add `system_audit` to permission map

### [ ] 3.2 Create audit log API module
- File: `frontend/src/api/auditLog.ts`
- `list(params)` → GET `/api/v1/system/operations` (reuse existing endpoint or add new)
- `export(params, format)` → GET with `Accept` header or query param

### [ ] 3.3 Create AuditLog view
- File: `frontend/src/views/AuditLog.vue`
- PageHeader + `a-table` with columns: 时间、用户、操作、资源、资源ID、详情、IP
- Filter form: 用户下拉、操作下拉、资源下拉、时间范围（RangePicker）
- Pagination: pageSize=20, showSizeChanger
- Detail drawer: show full detail, resource link navigation
- Export buttons: CSV / Excel

### [ ] 3.4 Register route & menu
- `frontend/src/router/index.ts`: add `/audit-log` route
- `frontend/src/components/AppSidebar.vue`: add menu item under "系统管理" with `feature: audit_log`, `permission: system_audit`

### [ ] 3.5 Export integration
- Use `frontend/utils/export.ts` utilities
- Support CSV and Excel formats

## Phase 4: Integration & Verification

### [ ] 4.1 End-to-end test
- Create route → verify audit log shows "route create" with name/URI
- Update route → verify "route update"
- Delete route → verify "route delete"
- Batch delete → verify single entry with ID list
- Failed request (401) → verify no audit log

### [ ] 4.2 Update documentation
- `docs/new/21-central-management.md` (or new audit-log chapter): document audit log page

### [ ] 4.3 Sync to main specs
- `openspec sync-specs --change audit-log-full-coverage`