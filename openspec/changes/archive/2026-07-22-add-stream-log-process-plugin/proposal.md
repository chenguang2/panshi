## Why

log_process 插件同时支持 HTTP 和 Stream 两种模式，但 Edge 网关对这两种模式使用完全独立的 API 端点（`/edge/admin/plugin_metadata/log_process` vs `/stream/edge/admin/plugin_metadata/log_process`）。当前平台只支持配置 HTTP 版本的插件元数据，Stream 版本的 log_process 插件元数据无法配置和管理。

## What Changes

1. **新增 `log_process_stream` 插件定义**：在 `plugin_definitions.py` 中注册 `log_process_stream`，复用 `log_process` 的 schema 和 metadata_schema，单独作为 Stream 模式专用插件
2. **Edge API 支持 Stream 端点**：`edge_client.py` 增加 `stream_plugin_metadata` 和 `stream_plugin` 资源路径
3. **发布逻辑适配**：`cluster_plugin_metadata.py` 根据 `plugin_name` 后缀自动选择 HTTP 或 Stream Edge 端点
4. **白名单注册**：`features.yaml` 的 `enabled_plugins` 加入 `log_process_stream`
5. **前端自动适配**：新增的插件在现有 PluginMetadata 页面中自然出现，无需额外 UI 开发

## Capabilities

### New Capabilities
- `stream-plugin-metadata`: Stream 模式插件元数据的管理能力，包括注册、配置、发布到 Stream Edge 端点

### Modified Capabilities
- `plugin-metadata-management`: 元数据发布逻辑变更，需根据插件名后缀选择不同 Edge 端点
- `edge-client`: 新增 `stream_plugin_metadata` 和 `stream_plugin` 资源路径

## Impact

- **Backend**: `app/config/plugin_definitions.py` — 新增 `log_process_stream` 插件定义
- **Backend**: `app/services/edge_client.py` — 新增 Stream 资源路径
- **Backend**: `app/api/v1/cluster_plugin_metadata.py` — 发布时根据插件名后缀选端点
- **Config**: `features.yaml` — `enabled_plugins` 加入 `log_process_stream`
- **Frontend**: 不需要改动（插件自动出现在元数据页面）
