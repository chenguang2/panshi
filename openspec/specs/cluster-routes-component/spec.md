## Purpose


集群路由 Vue 组件（ClusterRoutes）：承载集群路由列表、增删改查与发布状态展示交互。
## Requirements
### Requirement: ClusterRoutes component

The system SHALL provide a `ClusterRoutes` component that renders the routes tab content.

#### Scenario: Component renders route table
- **WHEN** `ClusterRoutes` receives `cluster` prop
- **THEN** it SHALL render an `a-table` with route name, URI, methods, upstream, priority, status, version, actions columns
- **THEN** it SHALL emit `refresh` when routes are modified

#### Scenario: Row click selection has visual feedback
- **WHEN** 用户点击行选中（`customRow.onClick` 置 `cluster.selectedRoute`）
- **THEN** 该行 SHALL 呈现选中高亮样式（与工具栏单操作按钮的启用态同时成立）
- **THEN** 切换选中行时高亮 SHALL 随之迁移；取消选中后 SHALL 移除高亮

#### Scenario: DNS routes are read-only in the tab
- **WHEN** 该行是 DNS 查询路由（plugin_name === 'dns_upstream'），或当前选中行（`cluster.selectedRoute`）是 DNS 查询路由
- **THEN** 行内操作按钮与工具栏「复制路由/编辑路由/发布/版本管理/删除路由」SHALL 禁用并显示 tooltip「DNS 路由请在『DNS 代理』页管理」（对齐独立页整行禁用语义，SHALL NOT 可绕过 DNS 代理页直接编辑/复制/发布）
- **THEN** 删除 toast 拦截守卫 SHALL 保留兜底
- **THEN** 双入口语义 SHALL 与独立页（route-management）一致

