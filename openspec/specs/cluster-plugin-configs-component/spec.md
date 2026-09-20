## Purpose


集群插件配置 Vue 组件（ClusterPluginConfigs）：承载插件配置列表、编辑弹窗与删除交互。
## Requirements
### Requirement: ClusterPluginConfigs component
The system SHALL provide a `ClusterPluginConfigs` component that renders the plugin configs tab content.

#### Scenario: Component renders plugin config list
- **WHEN** `ClusterPluginConfigs` receives `cluster` prop
- **THEN** it SHALL render plugin config cards/table with name, plugins count, version, actions
- **THEN** it SHALL emit `refresh` when plugin configs are modified
