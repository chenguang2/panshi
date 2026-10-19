# cluster-routes-composable Specification

## Purpose
TBD - created by archiving change add-route-batch-delete. Update Purpose after archive.
## Requirements
### Requirement: useClusterRoutes composable

The system SHALL provide a `useClusterRoutes` composable that encapsulates all route related state and operations, including batch selection and batch delete. 新建/编辑/复制 SHALL 按各自初始态或传入 record 完整重置/填充表单（SHALL NOT 依赖或泄漏前次表单会话状态），SHALL NOT 为打开表单而强制全量重载列表。

#### Scenario: Composable returns reactive state
- **WHEN** `useClusterRoutes(cluster)` is called
- **THEN** it SHALL return `{ routes, routesLoading, routesPagination, routesSearch, loadRoutes, deleteRoute, deleteRoutes, editRoute, addRoute, copyRoute, publishRoute, saveRoute, openRouteVersionManagement, loadRoutePlugins, selectRoutes }`

#### Scenario: selectRoutes syncs dual selection states
- **WHEN** `selectRoutes(cluster, keys, rows)` is called with the checkbox selection change
- **THEN** `cluster.selectedRouteKeys` SHALL be set to the checked keys
- **THEN** when exactly one key is checked, `cluster.selectedRoute` SHALL be set to that row
- **THEN** when two or more keys are checked, `cluster.selectedRoute` SHALL be set to null

#### Scenario: Copy fills all form fields from source record
- **WHEN** `copyRouteByRecord(sourceRoute)` is called
- **THEN** `routeForm` SHALL 从源路由回填完整字段全集，包括 `enableWebsocket`（`!!sourceRoute.enable_websocket`）与 `plugin_config_ids`（源值浅拷贝，无则空数组）——与 `editRouteByRecord` 的字段全集一致
- **THEN** 前次表单会话残留的 `enableWebsocket`/`plugin_config_ids` SHALL NOT 泄漏进复制表单（先编辑路由 A 再复制路由 B，B 的两字段 SHALL 来自 B）
- **THEN** 副本 `status` SHALL 沿用源路由（源启用则副本启用，已裁决不改写为禁用）

#### Scenario: Add resets leftover form state
- **WHEN** `showAddRouteModal(cluster)` 在前次编辑会话（如启用 WebSocket 的路由）之后打开新建表单
- **THEN** `routeForm.enableWebsocket` SHALL 重置为 false（重置清单 SHALL 覆盖全部表单字段，SHALL NOT 漏 `enableWebsocket`）

#### Scenario: Add/edit/copy open form without forced list reload
- **WHEN** 新建、编辑或复制入口打开表单
- **THEN** SHALL 直接按初始态或已持有的 record 填充并打开弹窗，SHALL NOT 先 `await loadRoutes()` 全量重载列表
- **THEN** 编辑/复制时仅当列表中找不到该记录 SHALL 重载一次列表后重试，仍找不到才提示（新建/编辑/复制三入口兜底行为 SHALL 一致）

#### Scenario: deleteRoutes performs batch delete
- **WHEN** `deleteRoutes(cluster)` is called with two or more routes checked
- **THEN** it SHALL open the delete confirmation dialog with the selected route names in the title
- **THEN** on confirmation it SHALL call the batch delete endpoint with `route_ids`
- **THEN** it SHALL display per-route progress via `executeDeleteWithProgress`
- **THEN** on completion it SHALL clear both `selectedRouteKeys` and `selectedRoute` via `clearSelectedFn`

#### Scenario: deleteRoutes guards DNS routes
- **WHEN** `deleteRoutes(cluster)` is called and the selection contains a DNS route (plugin_name === 'dns_upstream')
- **THEN** it SHALL block the deletion and inform the user that DNS query routes are managed in the DNS query page

#### Scenario: single delete guards DNS routes
- **WHEN** the single delete flow (`deleteRoute`/`deleteRouteByRecord`) targets a DNS route
- **THEN** the deletion SHALL be blocked with the same DNS route message

