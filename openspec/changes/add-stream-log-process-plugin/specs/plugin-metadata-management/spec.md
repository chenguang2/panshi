## MODIFIED Requirements

### Requirement: 发布时选择正确的 Edge 端点

系统 SHALL 在发布插件元数据时，根据 `plugin_name` 的后缀自动选择 HTTP 或 Stream 的 Edge API 端点。

#### Scenario: HTTP 插件走 HTTP 端点
- **WHEN** `plugin_name` 不以 `_stream` 结尾
- **THEN** 发布 SHALL 使用 `plugin_metadata` 资源（`/edge/admin/plugin_metadata`）
- **AND** 重载 SHALL 使用 `plugin` 资源（`/edge/admin/plugins/reload`）

#### Scenario: Stream 插件走 Stream 端点
- **WHEN** `plugin_name` 以 `_stream` 结尾
- **THEN** 发布 SHALL 使用 `stream_plugin_metadata` 资源（`/stream/edge/admin/plugin_metadata`）
- **AND** 重载 SHALL 使用 `reload_stream_plugins()`（`/stream/edge/admin/plugins/reload`）
- **AND** 推送到 Edge 的 URL 中的插件名 SHALL 去掉 `_stream` 后缀（`log_process_stream` → `log_process`）

#### Scenario: Stream 插件删除走 Stream 端点
- **WHEN** `plugin_name` 以 `_stream` 结尾
- **AND** 用户选择删除 Edge 端配置
- **THEN** 删除 SHALL 使用 `stream_plugin_metadata` 资源

#### Scenario: 集群删除时 Stream 插件走 Stream 端点
- **WHEN** 删除整个集群
- **AND** 遍历到 `plugin_name` 以 `_stream` 结尾的记录
- **THEN** 删除 SHALL 使用 `stream_plugin_metadata` 资源
