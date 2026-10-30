# audit-log-ui Delta

## MODIFIED Requirements

### Requirement: Audit log list displays paginated table with columns
The list page SHALL display a table with columns: 时间、用户、资源、操作、详情、IP（列序 = 自然语序「何时·谁·对哪个资源·做了什么」，2026-10-29 验收调整）。资源列 SHALL 以「{资源中文名} #{resource_id}」合并展示（resource_id 为空仅显示资源名）；不再单列资源ID。操作列 SHALL 按动作语义着色：删除/批量删除/清理类显示 danger 弱色标签，创建/导入/生成类显示 success 弱色标签，其余显示中性描边标签；标签文案 SHALL 仅含动词中文名（资源名由资源列承载，避免整列重复；tooltip 显示全称+原始 action）。列表排序 SHALL 唯一为时间倒序（后端 `id desc`），表头不提供列排序控件。筛选条右侧统计文案 SHALL 为「筛选结果 X 条 · 全库共 Y 条（最早 …）」形态，X 为当前筛选结果数、Y 为库内累计数。

#### Scenario: Page loads and shows audit logs
- **WHEN** admin visits `/audit-log`
- **THEN** table shows latest 20 entries (default page size), descending by `created_at`
- **THEN** each row shows: formatted timestamp, username, color-coded action tag, resource with merged `#resource_id`, truncated detail (max 50 chars + tooltip, default-template detail shows "—"), ip_address
- **THEN** the counter line reads 「筛选结果 20 条 · 全库共 {Y} 条（最早 {date}）」 matching response totals

#### Scenario: Pagination works
- **WHEN** admin clicks page 2
- **THEN** table shows entries 21-40

#### Scenario: Default time range is last 7 days
- **WHEN** admin first visits `/audit-log`
- **THEN** time range filter defaults to "最近 7 天" and the list reflects that range

#### Scenario: Combined filters
- **WHEN** multiple filters applied
- **THEN** results satisfy ALL filters (AND logic)

#### Scenario: Delete-family actions are visually distinct
- **WHEN** a row's action verb is delete/batch_delete/cleanup family
- **THEN** the action tag renders in the danger tone; create/import/generate family renders success tone; other verbs render neutral outline

### Requirement: Dynamic filter options from API
The filter dropdowns (用户、资源、操作、IP) SHALL load options dynamically from backend API `/api/v1/system/operations/meta` returning distinct values, not hardcoded. Dropdowns SHALL be searchable (type-to-filter) via a-select showSearch. The meta response SHALL include `ips` (distinct non-empty ip_address values) alongside users/actions/resources. The 操作 dropdown SHALL be linked to the 资源 selection: when a resource is chosen, only actions whose `resource_verb` resource segment matches it are offered (2026-10-29 用户验收反馈)；actions whose resource segment cannot be resolved appear only under 全部资源. Switching 资源 SHALL clear a selected 操作 that no longer matches.

#### Scenario: Filter options loaded dynamically
- **WHEN** admin opens `/audit-log` page
- **THEN** frontend calls `GET /api/v1/system/operations/meta`
- **THEN** response provides `{users: [...], actions: [...], resources: [...], ips: [...]}`
- **THEN** dropdowns populated with returned values, each selectable by typing to search

#### Scenario: Action options follow the selected resource
- **WHEN** admin selects 资源 = ClickHouse 配置
- **THEN** the 操作 dropdown offers only clickhouse_config_* actions (plus 全部操作)
- **THEN** the list reloads filtered by the resource
- **WHEN** a previously selected action no longer matches the newly chosen resource
- **THEN** the action selection is cleared automatically

### Requirement: Resource link navigation via maintainable mapping
The list page 资源列 SHALL render resource names as clickable links to corresponding detail pages when a mapping exists, navigating via in-app router (no full page reload). The resource-to-route mapping SHALL be maintained in a single config file (`frontend/src/config/auditResourceRoutes.ts`) for easy maintenance. Resources without a mapping SHALL render as plain text with the raw resource key as tooltip.

#### Scenario: Click cluster name navigates to cluster detail
- **WHEN** the list shows `resource="cluster"`, `resource_id=1`
  <!-- 2026-10-29 UX review 裁决：原 spec 的 `<a href="/clusters/1">` + window.location.href 整页刷新改为 SPA 内 router 导航；场景标题保留 -->
- **THEN** the resource cell renders as a link to `/clusters/1`
- **WHEN** clicked, navigates via router to cluster detail page without full page reload

#### Scenario: New resource type added without code changes to drawer
- **WHEN** new resource type "plugin_config" added to `auditResourceRoutes.ts`
- **THEN** the resource cell automatically renders link for plugin_config resources

#### Scenario: High-frequency resources are navigable
- **WHEN** the list shows resources upstream / route / user / ssl_cert / node_task / autostart with a resource_id
  <!-- 2026-10-29 落地微调：node 无独立页面（节点列表仅存在于集群子页），以 autostart（/edge-autostart）替代——proposal 影响节已预告按路由存在性校准 -->
- **THEN** each renders as a link to its list page per the mapping table

#### Scenario: Non-mapped resources render as plain text
- **WHEN** the list shows a resource with no route mapping (e.g. `db_migration`)
- **THEN** the cell renders plain text (Chinese label) with the raw resource key as tooltip, not a link

### Requirement: Export to CSV/Excel with large dataset support
The page SHALL provide "导出 CSV" / "导出 Excel" buttons exporting the current filtered result set. Export SHALL always be generated by the backend (`POST /api/v1/system/operations/export`) regardless of dataset size; the frontend per-page streaming path SHALL be removed. When the filtered count exceeds the backend export cap (50000), the UI SHALL warn 「筛选结果超过 50000 条，仅导出最近 50000 条」 before download. Exported cell values SHALL be neutralized against spreadsheet formula injection: a value whose first character is one of `=`, `+`, `-`, `@` (or a tab/CR) SHALL receive a leading single-quote prefix before being written, for both CSV and XLSX exports.

#### Scenario: Export current filtered results (small dataset)
- **WHEN** admin clicks "导出 CSV" and filtered count ≤ 5000
- **THEN** frontend calls `POST /api/v1/system/operations/export` with current filters
- **THEN** downloads the generated file via the existing task download endpoint
  <!-- 2026-10-29 UX review 裁决：≤5000 前端逐页拉全量（最多 25 次串行请求）路径移除，统一走后端生成；行为不变、路径收敛 -->

#### Scenario: Export large dataset (async backend generation)
- **WHEN** admin clicks "导出 CSV" and filtered count > 5000
- **THEN** frontend calls `POST /api/v1/system/operations/export` with filters
- **THEN** backend returns `{task_id: "..."}`, polls `/api/v1/system/operations/export/{task_id}` until `status="ready"`
- **THEN** downloads file via `GET /api/v1/system/operations/export/{task_id}/download`

#### Scenario: Export truncation warning
- **WHEN** admin exports and the filtered count exceeds 50000
- **THEN** a warning 「筛选结果超过 50000 条，仅导出最近 50000 条」 is shown before/with the download

#### Scenario: Export Excel
- **WHEN** admin clicks "导出 Excel"
- **THEN** downloads .xlsx with proper column widths and headers (same async logic for large datasets)

#### Scenario: Export neutralizes formula injection
- **WHEN** an exported cell value (e.g. a description field) begins with `=`, `+`, `-` or `@`
- **THEN** the cell SHALL be written with a leading single-quote prefix so spreadsheets treat it as text
- **AND** the neutralization SHALL apply to both CSV and XLSX exports, verified by export round-trip tests

## ADDED Requirements

### Requirement: Time range quick presets
The time range filter SHALL provide quick presets: 今天、近 7 天、近 30 天。Clicking a preset SHALL apply the corresponding range and reload page 1. Clearing the range SHALL remove the time constraint and reload.

#### Scenario: Preset applies range
- **WHEN** admin clicks "近 30 天" preset
- **THEN** the range picker shows the last 30 days and the list reloads from page 1 with that range

#### Scenario: Clearing range removes time constraint
- **WHEN** admin clears the range picker
- **THEN** the list reloads without start/end constraints

### Requirement: Archive history access
The page SHALL provide an 「归档历史」 entry listing server-side archive files (`data/archives/`): filename, size, archive time, each with a download action (authorized blob download). The backend SHALL expose `GET /api/v1/system/operations/archives` (list) and `GET /api/v1/system/operations/archives/{filename}/download`, both gated by `audit_logs` permission and the `audit_log` feature flag. The archive listing SHALL be included in the security guard unauthenticated samples.

#### Scenario: Admin lists past archives
- **WHEN** admin opens 「归档历史」
- **THEN** a list shows each archive file with filename/size/time and a 下载 button

#### Scenario: Admin downloads a past archive
- **WHEN** admin clicks 下载 on an archive row
- **THEN** the CSV file downloads with Authorization header (blob), no top-level navigation

#### Scenario: No archives yet
- **WHEN** the archive directory is empty
- **THEN** the list shows empty state 「暂无归档存档」 with hint text pointing to 归档清理

### Requirement: Keyword search over audit details
The list endpoint SHALL accept a `keyword` parameter matching `detail` (case-insensitive substring) or exact `resource_id`; the filter bar SHALL provide a search input with placeholder 「搜索详情 / 资源ID」. Search SHALL combine with existing filters (AND) and reset to page 1 on enter/apply.

#### Scenario: Keyword matches detail content
- **WHEN** admin enters 「默认连接」 in the search box and presses Enter
- **THEN** the list shows only rows whose detail contains that substring (case-insensitive)

#### Scenario: Keyword matches resource id
- **WHEN** admin enters a pure number 「8」
- **THEN** rows with resource_id=8 are included in results alongside detail substring matches

## REMOVED Requirements

### Requirement: Reuse existing export utility for small datasets
**Reason**: 导出路径收敛——CSV/Excel 全部走后端生成（同一代码路径、同一公式注入中和、同一鉴权下载），前端 ≤5000 行逐页流式拉取路径（最多 25 次串行请求、重复实现公式转义）移除；`exportToCsv` 共享工具仍服务其他页面，仅审计页不再使用。
**Migration**: 无数据迁移；组件测试中「前端流式导出」相关用例随批 2 反转为后端路径断言。
