## ADDED Requirements

### Requirement: Business handlers enrich AuditLog detail via request.state.audit
The system SHALL allow route handlers to access `request.state.audit` and enrich the `detail` field with business context. For UPDATE operations, the detail MUST include before/after comparison of changed fields (compliance requirement).

#### Scenario: DELETE route enriches detail with route name and URI
- **WHEN** handler processes `DELETE /clusters/1/routes/14`
- **THEN** handler loads `Route` object, sets `request.state.audit.detail = f"删除路由 {route.name} ({route.uri})"`

#### Scenario: CREATE upstream enriches detail and backfills resource_id
- **WHEN** handler processes `POST /clusters/1/upstreams` and flushes new upstream
- **THEN** handler sets `request.state.audit.detail = f"新增上游 {upstream.name} ({upstream.scheme}://{upstream.nodes})"`
- **THEN** handler sets `request.state.audit.resource_id = upstream.id`

#### Scenario: UPDATE route enriches detail with before/after comparison
- **WHEN** handler processes `PUT /clusters/1/routes/14` with body `{uri: "/new-path"}`
- **THEN** handler loads old route, captures `old_uri = route.uri`, applies update, flushes
- **THEN** handler sets `request.state.audit.detail = f"更新路由 {route.name}: uri 从 '/old-path' 变更为 '/new-path'"`

#### Scenario: UPDATE upstream enriches detail with changed fields
- **WHEN** handler processes `PUT /clusters/1/upstreams/5` with body `{name: "new-name", scheme: "https"}`
- **THEN** handler captures old values, applies update, flushes
- **THEN** handler sets `request.state.audit.detail = f"更新上游 {upstream.name}: name 从 'old' 变更为 'new-name', scheme 从 'http' 变更为 'https'"`

#### Scenario: UPDATE ssl_cert enriches detail with domain
- **WHEN** handler processes `PUT /clusters/1/ssl/5`
- **THEN** handler sets `request.state.audit.detail = f"更新证书 {cert.domain} (issuer={cert.issuer})"`

#### Scenario: Batch delete enriches detail with ID list
- **WHEN** handler processes batch delete `DELETE /clusters/1/routes` with `{ids: [14,15,16]}`
- **THEN** handler sets `request.state.audit.detail = f"批量删除路由: [14, 15, 16] 共 3 条"`

#### Scenario: Concurrent modification handling
- **WHEN** handler reads object for detail enrichment but concurrent request modifies it before commit
- **THEN** detail reflects state at read time (accepted limitation); optimistic lock version recorded in detail if available: `detail += " (version=5)"`

### Requirement: log_audit helper supports same-object enrichment
The `log_audit()` function SHALL accept an optional `audit_obj` parameter to enrich an existing `AuditLog` object instead of creating a new one.

#### Scenario: Enrich existing audit object
- **WHEN** `log_audit(db, audit_obj=request.state.audit, detail="...")` is called
- **THEN** the provided `AuditLog` object is updated with the new `detail` (and optional other fields)
- **THEN** no new `AuditLog` row is created

#### Scenario: Without audit_obj creates new row (backward compatibility)
- **WHEN** `log_audit(db, action="...", detail="...")` is called without `audit_obj`
- **THEN** a new `AuditLog` is created and added to session (existing behavior preserved)

#### Scenario: resource_id backfill after flush
- **WHEN** handler creates new resource, flushes to get ID, then calls `log_audit(db, audit_obj=request.state.audit, resource_id=new_obj.id)`
- **THEN** the existing `AuditLog` object's `resource_id` is updated
- **THEN** no new row created, same transaction

### Requirement: Default detail template for handlers that don't enrich
The system SHALL provide a default detail template for mutating operations that don't explicitly enrich. The template is applied by the hook after the handler returns but before transaction commit.

#### Scenario: Handler skips detail enrichment
- **WHEN** handler returns success but never touches `request.state.audit.detail`
- **THEN** hook applies generic template: `{resource} {action} (id={resource_id})` (e.g., `"route route_delete (id=14)"`)
- **THEN** for batch operations: `{resource} batch_{action} (ids=[14,15,16])`