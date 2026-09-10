## MODIFIED Requirements

### Requirement: Admin user management includes audit log permission
The user management capability SHALL include a new permission key `audit_logs` (plural, consistent with existing keys like `clusters`, `routes`, `upstreams`) for accessing the audit log page.

#### Scenario: Admin has audit log permission by default
- **WHEN** system initializes default admin user
- **THEN** admin has `audit_logs` permission (via role=admin bypass)

#### Scenario: Regular user without audit_logs cannot access audit log
- **WHEN** user without `audit_logs` permission tries to visit `/audit-log`
- **THEN** frontend hides menu item; backend returns 403 on API call

#### Scenario: Permission assignment via user edit modal
- **WHEN** admin edits a user and grants "系统管理 → 审计日志" permission
- **THEN** `audit_logs` permission key is added to user's permissions
- **THEN** user sees audit log menu after token refresh (re-login or explicit token refresh)

#### Scenario: Permission change takes effect without full re-login
- **WHEN** admin grants `audit_logs` to user
- **THEN** frontend detects permission change (via periodic `/api/v1/auth/me` poll or manual refresh button)
- **THEN** menu appears without full re-login

### Requirement: Feature flag for audit_log module
The system SHALL add `audit_log` feature flag in `features.yaml` to gate the audit log module.

#### Scenario: Feature disabled hides module completely
- **WHEN** `features.yaml` has `audit_log: false`
- **THEN** audit log menu hidden for all users (including admin)
- **THEN** API endpoints return 404 or 403

#### Scenario: Feature enabled shows module per permission
- **WHEN** `features.yaml` has `audit_log: true`
- **THEN** menu visibility follows `system_audit` permission