## Purpose


集群路由 Vue 组件（ClusterRoutes）：承载集群路由列表、增删改查与发布状态展示交互。
## Requirements
### Requirement: ClusterRoutes component
The system SHALL provide a `ClusterRoutes` component that renders the routes tab content.

#### Scenario: Component renders route table
- **WHEN** `ClusterRoutes` receives `cluster` prop
- **THEN** it SHALL render an `a-table` with route name, URI, methods, upstream, priority, status, version, actions columns
- **THEN** it SHALL emit `refresh` when routes are modified
