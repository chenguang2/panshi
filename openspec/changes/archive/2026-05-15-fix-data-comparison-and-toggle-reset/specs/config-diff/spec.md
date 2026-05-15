## ADDED Requirements

### Requirement: 插件元数据为空配置时正确判断存在性

`_compare_plugin_metadata` SHALL 使用 `edge_data is None` 而非 `not edge_data` 来判断 Edge 上是否存在插件元数据，避免空配置 `{}` 被误判为"edge 中不存在"。

#### Scenario: 空配置不被误判为 only_in_db
- **WHEN** 数据库中存在 `data_center` 插件元数据且 `config_data='{}'`
- **AND** Edge 节点存在对应的 `data_center` 元数据且值为 `{}`
- **THEN** 对比结果 SHALL 为 `match`（当两者都为空时）或 `diff`（当内容不一致时）
- **AND** 不 SHALL 返回 `only_in_db`
