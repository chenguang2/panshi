# route-management Delta

## MODIFIED Requirements

### Requirement: Route management page

Admins SHALL be able to view, search, filter, create, copy, edit, delete, publish, and version-manage routes from a dedicated page. 列表 SHALL 展示发布状态（PublishStatusTag）并支持服务端排序；筛选下拉 SHALL 随当前用户可见集群收敛；危险与歧义场景 SHALL 有明确提示与行动出口。

#### Scenario: Page layout
- **WHEN** admin navigates to `/routes`
- **THEN** a page SHALL display with PageHeader title "路由管理"
- **THEN** a cluster filter dropdown SHALL be in the page header
- **THEN** a "新建路由" button SHALL be in the page header
- **THEN** "发布全部" button SHALL NOT appear

#### Scenario: Method filter chips
- **WHEN** the page loads
- **THEN** method filter chips SHALL 常驻展示高频方法：全部, GET, POST, PUT, DELETE, PATCH
- **THEN** 低频方法（OPTIONS/CONNECT/TRACE 等）SHALL 收进方法筛选下拉，SHALL NOT 常驻 chips

#### Scenario: Filter bar
- **WHEN** the page loads
- **THEN** a search input SHALL filter by name/URI/description/域名（hosts，对齐后端 ALLOWED_SEARCH_FIELDS），placeholder SHALL 说明可搜字段
- **THEN** a publish status dropdown SHALL filter (全部/已发布/未发布/待发布)
- **THEN** a plugin dropdown SHALL filter by plugin name (options from `/plugins/builtin`)
- **THEN** the API SHALL support `method` parameter for method chip filtering
- **THEN** the API SHALL support `publish_status` parameter (published/unpublished/pending) by checking ConfigVersion records and pending_publish
- **THEN** the API SHALL support `plugin` parameter to filter by RoutePlugin.plugin_name
- **THEN** a count SHALL show "共 N 条路由"
- **THEN** the filter bar SHALL 允许换行（SHALL NOT nowrap 溢出视口），计数与刷新按钮 SHALL 右置同组

#### Scenario: Filter options scoped by user clusters
- **WHEN** 非 admin 用户打开本页
- **THEN** 集群筛选下拉的选项 SHALL 仅包含当前用户授权的集群（与 `GET /clusters` 用户视角同源；admin 全量不变）
- **THEN** 上游筛选下拉 SHALL 随所选集群收敛（集群不可见即不可选其上游）

#### Scenario: Table display
- **WHEN** routes exist
- **THEN** a table SHALL show columns: name+description, URI, methods, cluster, priority, 发布状态（PublishStatusTag，取代裸版本列）, created time, actions
- **THEN** the status column SHALL NOT appear (replaced by publish status tag)
- **THEN** pagination SHALL be supported
- **THEN** name/URI/priority/status/created_at 列的排序 SHALL 走服务端（`sorter: true`，请求透传 `sort_by/sort_order`，值域限后端 `ALLOWED_SORT_FIELDS`），表头排序箭头 SHALL 跨页生效（SHALL NOT 仅当前页本地重排；其中 status 指启停状态）
- **THEN** 发布状态列（PublishStatusTag，pending 为派生值非表列）SHALL NOT 提供排序

#### Scenario: Empty states are actionable
- **WHEN** 列表为空
- **THEN** 无任何筛选时 SHALL 显示「尚未创建路由」并提供「新建路由」按钮
- **THEN** 存在筛选条件时 SHALL 显示「没有符合条件路由」并提供「清空筛选」按钮（重置 search/集群/发布状态/插件/方法）

#### Scenario: Deep link preselects cluster
- **WHEN** 用户经 `?cluster_id=` 深链进入本页并点击「新建路由」
- **THEN** 新建弹窗 SHALL 预选该集群（以当前 clusterFilter 为默认值）

#### Scenario: Action menu
- **WHEN** admin clicks the action button (⋯)
- **THEN** a dropdown SHALL show: 复制路由, 编辑, 发布, 版本管理, 删除
- **THEN** 禁用 SHALL NOT appear in the menu
- **WHEN** 该行是 DNS 查询路由（plugin_name === 'dns_upstream'）
- **THEN** 操作按钮 SHALL 禁用并显示 tooltip「DNS 路由请在『DNS 代理』页管理」（SHALL NOT 点击后才弹 toast 拦截）

#### Scenario: Create/Edit route
- **WHEN** admin clicks "新建路由" or "编辑"
- **THEN** RouteFormModal SHALL open with fields matching cluster route form
- **THEN** "所属集群" SHALL be present (editable on create, readonly on edit)
- **THEN** 优先级字段 SHALL 提供 hint「数值越大越优先匹配」（语义已裁决：大者先）
- **ON SAVE** the route SHALL be created/updated via existing API
- **WHEN** 保存失败
- **THEN** SHALL 经 `getApiErrorMessage` 透出后端原因（如名称重复、上游校验失败），SHALL NOT 仅显示「保存失败」

#### Scenario: Copy route
- **WHEN** admin clicks "复制路由"
- **THEN** a copy of the route SHALL be created via existing API

#### Scenario: Delete route
- **WHEN** admin clicks "删除"
- **THEN** the existing delete function from useClusterRoutes SHALL be used
- **THEN** 删除确认弹窗的节点清单 SHALL 全量拉取（显式 `page_size` 对齐后端 MAX_PAGE_SIZE），SHALL NOT 依赖后端默认 page_size=20 静默截断

#### Scenario: Publish route
- **WHEN** admin clicks "发布"
- **THEN** the existing publish function from useClusterRoutes SHALL be used

#### Scenario: Version management
- **WHEN** admin clicks "版本管理"
- **THEN** the existing VersionManagementModal SHALL be used
- **THEN** SHALL 传 `:can-publish="true"` 并接 `@publish-requested`（恢复后发布出口，接线语义见 config-version-management）
