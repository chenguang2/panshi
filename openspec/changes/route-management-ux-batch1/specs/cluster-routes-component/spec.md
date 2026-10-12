# cluster-routes-component Delta

## MODIFIED Requirements

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
