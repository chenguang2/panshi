## MODIFIED Requirements

### Requirement: 新增 Stream Edge 资源路径

`EdgeClient.RESOURCE_PATHS` SHALL 新增 `stream_plugin_metadata` 和 `stream_plugin` 两条路径映射。

#### Scenario: 资源路径映射
- **WHEN** `EdgeClient` 初始化
- **THEN** `RESOURCE_PATHS` SHALL 包含 `"stream_plugin_metadata": "/stream/edge/admin/plugin_metadata"`
- **AND** SHALL 包含 `"stream_plugin": "/stream/edge/admin/plugins"`

### Requirement: 现有方法增加 stream 参数

`EdgeClient` 的 `create_plugin_metadata`、`delete_plugin_metadata`、`get_plugin_metadata`、`update_plugin_metadata` SHALL 增加 `stream=False` 参数。

#### Scenario: stream=True 时使用 Stream 资源
- **WHEN** 调用 `create_plugin_metadata(name, data, stream=True)`
- **THEN** SHALL 使用 `stream_plugin_metadata` 资源（`/stream/edge/admin/plugin_metadata`）
- **WHEN** 调用 `delete_plugin_metadata(name, stream=True)`
- **THEN** SHALL 使用 `stream_plugin_metadata` 资源

### Requirement: 新增 Stream 专用方法

`EdgeClient` SHALL 新增 `reload_stream_plugins()` 和 `list_stream_plugin_metadata()` 方法。

#### Scenario: reload_stream_plugins
- **WHEN** 调用 `reload_stream_plugins()`
- **THEN** SHALL 发送 PUT 请求到 `/stream/edge/admin/plugins/reload`

#### Scenario: list_stream_plugin_metadata
- **WHEN** 调用 `list_stream_plugin_metadata()`
- **THEN** SHALL 发送 GET 请求到 `/stream/edge/admin/plugin_metadata`
