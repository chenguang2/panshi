## Purpose


集群插件配置 composable（useClusterPluginConfigs）：封装插件配置的加载、保存与删除逻辑。
## Requirements
### Requirement: useClusterPluginConfigs composable
The system SHALL provide a `useClusterPluginConfigs` composable that encapsulates all plugin config related state and operations.

#### Scenario: Composable returns reactive state
- **WHEN** `useClusterPluginConfigs(cluster)` is called
- **THEN** it SHALL return `{ pluginConfigs, loadPluginConfigs, addPluginConfig, editPluginConfig, deletePluginConfig, viewPluginConfig, openPluginConfigVersionManagement }`
