# Route Management

## Purpose

Provide a dedicated page for admins to manage API routes across all clusters from a single view.

## Requirements

### Requirement: Route management page

Admins SHALL be able to view, search, filter, create, copy, edit, delete, publish, and version-manage routes from a dedicated page.

#### Scenario: Page layout
- **WHEN** admin navigates to `/routes`
- **THEN** a page SHALL display with PageHeader title "路由管理"
- **THEN** a cluster filter dropdown SHALL be in the page header
- **THEN** a "新建路由" button SHALL be in the page header
- **THEN** "发布全部" button SHALL NOT appear

#### Scenario: Method filter chips
- **WHEN** the page loads
- **THEN** HTTP method filter chips SHALL appear: 全部, GET, POST, PUT, DELETE, PATCH

#### Scenario: Filter bar
- **WHEN** the page loads
- **THEN** a search input SHALL filter by name/URI/description
- **THEN** a publish status dropdown SHALL filter (全部/已发布/未发布)
- **THEN** a plugin dropdown SHALL filter by plugin name (options from `/plugins/builtin`)
- **THEN** the API SHALL support `method` parameter for method chip filtering
- **THEN** the API SHALL support `publish_status` parameter (published/unpublished) by checking ConfigVersion records
- **THEN** the API SHALL support `plugin` parameter to filter by RoutePlugin.plugin_name
- **THEN** a count SHALL show "共 N 条路由"

#### Scenario: Table display
- **WHEN** routes exist
- **THEN** a table SHALL show columns: name+description, URI, methods, cluster, priority, version, created time, actions
- **THEN** the status column SHALL NOT appear (replaced by version)
- **THEN** pagination SHALL be supported

#### Scenario: Action menu
- **WHEN** admin clicks the action button (⋯)
- **THEN** a dropdown SHALL show: 复制路由, 编辑, 发布, 版本管理, 删除
- **THEN** 禁用 SHALL NOT appear in the menu

#### Scenario: Create/Edit route
- **WHEN** admin clicks "新建路由" or "编辑"
- **THEN** RouteFormModal SHALL open with fields matching cluster route form
- **THEN** "所属集群" SHALL be present (editable on create, readonly on edit)
- **ON SAVE** the route SHALL be created/updated via existing API

#### Scenario: Copy route
- **WHEN** admin clicks "复制路由"
- **THEN** a copy of the route SHALL be created via existing API

#### Scenario: Delete route
- **WHEN** admin clicks "删除"
- **THEN** the existing delete function from useClusterRoutes SHALL be used

#### Scenario: Publish route
- **WHEN** admin clicks "发布"
- **THEN** the existing publish function from useClusterRoutes SHALL be used

#### Scenario: Version management
- **WHEN** admin clicks "版本管理"
- **THEN** the existing VersionManagementModal SHALL be used
