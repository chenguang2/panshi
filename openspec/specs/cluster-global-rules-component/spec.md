## Purpose


集群全局规则 Vue 组件（ClusterGlobalRules）：承载全局规则列表、编辑与删除交互，供集群详情页复用。
## Requirements
### Requirement: ClusterGlobalRules component
The system SHALL provide a `ClusterGlobalRules` component that renders the global rules tab content.

#### Scenario: Component renders global rule list
- **WHEN** `ClusterGlobalRules` receives `cluster` prop
- **THEN** it SHALL render global rule cards with description, plugins, actions
- **THEN** it SHALL emit `refresh` when global rules are modified
