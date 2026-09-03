## ADDED Requirements

### Requirement: Audit log list page accessible to admin only
The system SHALL provide a page at `/audit-log` under "系统管理" menu, visible only to users with `permission: system_audit` and `feature: audit_log`. When `feature: audit_log=false`, the module is completely hidden even for admin (feature flag highest priority).

#### Scenario: Admin user sees menu item when feature enabled
- **WHEN** admin (role=admin) loads sidebar and `features.yaml` has `audit_log: true`
- **THEN** "审计日志" appears under "系统管理" group

#### Scenario: Admin does not see menu item when feature disabled
- **WHEN** admin loads sidebar and `features.yaml` has `audit_log: false`
- **THEN** "审计日志" is hidden (feature flag highest priority)

#### Scenario: Non-admin user does not see menu item
- **WHEN** regular user (role=user) loads sidebar
- **THEN** "审计日志" is hidden

### Requirement: Audit log list displays paginated table with columns
The list page SHALL display a table with columns: 时间、用户、操作、资源、资源ID、详情、IP。详情列默认截断显示，悬浮 tooltip 显示完整内容。

#### Scenario: Page loads and shows audit logs
- **WHEN** admin visits `/audit-log`
- **THEN** table shows latest 20 entries (default page size), descending by `created_at`
- **THEN** each row shows: formatted timestamp, username, action, resource, resource_id, truncated detail (max 50 chars + tooltip), ip_address

#### Scenario: Pagination works
- **WHEN** admin clicks page 2
- **THEN** table shows entries 21-40

#### Scenario: Default time range is last 7 days
- **WHEN** admin first visits `/audit-log`
- **THEN** time range filter defaults to "最近 7 天"

#### Scenario: Combined filters
- **WHEN** multiple filters applied
- **THEN** results satisfy ALL filters (AND logic)

### Requirement: Dynamic filter options from API
The filter dropdowns (用户、操作、资源) SHALL load options dynamically from backend API `/api/v1/system/operations/meta` returning distinct values, not hardcoded.

#### Scenario: Filter options loaded dynamically
- **WHEN** admin opens `/audit-log` page
- **THEN** frontend calls `GET /api/v1/system/operations/meta`
- **THEN** response provides `{users: [...], actions: [...], resources: [...]}`
- **THEN** dropdowns populated with returned values

### Requirement: Detail drawer with scroll and copy support
The detail drawer SHALL support vertical scrolling for long `detail` content, and provide a "复制" button to copy full detail to clipboard.

#### Scenario: Long detail content scrollable
- **WHEN** drawer opens with detail exceeding drawer height
- **THEN** drawer content area is scrollable (max-height with overflow-y: auto)

#### Scenario: Copy detail to clipboard
- **WHEN** admin clicks "复制" button in drawer
- **THEN** full `detail` text copied to clipboard, toast shows "已复制"

### Requirement: Resource link navigation via maintainable mapping
The detail drawer SHALL render resource names as clickable links to corresponding detail pages. The resource-to-route mapping SHALL be maintained in a single config file (`frontend/src/config/auditResourceRoutes.ts`) for easy maintenance.

#### Scenario: Click cluster name navigates to cluster detail
- **WHEN** drawer shows `resource="cluster"`, `resource_id=1`
- **THEN** cluster name renders as `<a href="/clusters/1">集群名称</a>`
- **WHEN** clicked, navigates to cluster detail page

#### Scenario: New resource type added without code changes to drawer
- **WHEN** new resource type "plugin_config" added to `auditResourceRoutes.ts`
- **THEN** drawer automatically renders link for plugin_config resources

### Requirement: Export to CSV/Excel with large dataset support
The page SHALL provide "导出" button exporting filtered results to CSV or Excel. For large datasets (>5000 rows), backend SHALL generate file asynchronously and provide download link to avoid frontend OOM/timeout.

#### Scenario: Export current filtered results (small dataset)
- **WHEN** admin clicks "导出 CSV" and filtered count ≤ 5000
- **THEN** frontend streams all pages, calls `exportToCsv(data, filename)` from shared util

#### Scenario: Export large dataset (async backend generation)
- **WHEN** admin clicks "导出 CSV" and filtered count > 5000
- **THEN** frontend calls `POST /api/v1/system/operations/export` with filters
- **THEN** backend returns `{task_id: "..."}`, polls `/api/v1/system/operations/export/{task_id}` until `status="ready"`
- **THEN** downloads file via `GET /api/v1/system/operations/export/{task_id}/download`

#### Scenario: Export Excel
- **WHEN** admin clicks "导出 Excel"
- **THEN** downloads .xlsx with proper column widths and headers (same async logic for large datasets)

### Requirement: Reuse existing export utility for small datasets
For datasets ≤ 5000 rows, export SHALL reuse `frontend/utils/export.ts` utility for consistent formatting.

#### Scenario: Export uses shared utility
- **WHEN** export triggered for small dataset
- **THEN** calls `exportToCsv(data, filename)` or `exportToExcel(data, filename)` from shared util