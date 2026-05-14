## Why

上游（upstream）和路由（route）发布时，后端会通过 `EdgeLogger` 将每个 Edge 节点的 API 调用记录到日志文件（`logs/edge/upstream.log`、`logs/edge/route.log`），便于排查发布问题和审计操作。但插件组（plugin config）、全局规则（global rule）、插件元数据（plugin metadata）的发布操作缺少同样的日志记录。

## What Changes

- 在 `EdgeLogger` 中新增三个日志方法：`log_plugin_config_operation`、`log_global_rule_operation`、`log_plugin_metadata_operation`
- 更新 `publish_plugin_config` 端点，在推送到每个 Edge 节点时记录日志
- 更新 `publish_global_rule` 端点，在推送到每个 Edge 节点时记录日志
- 更新 `publish_plugin_metadata` 端点，在推送到每个 Edge 节点时记录日志

## Capabilities

### New Capabilities
- `publish-edge-logging`: 插件组、全局规则、插件元数据发布操作的 Edge 节点同步日志

### Modified Capabilities

<!-- 无 -->

## Impact

- `backend/app/services/edge_logger.py`: 新增 3 个日志方法，新增 3 个日志文件常量
- `backend/app/api/v1/clusters.py`: `publish_plugin_config` 和 `publish_global_rule` 增加 `edge_logger` 调用
- `backend/app/api/v1/plugin_metadata.py`: `publish_plugin_metadata` 增加 `edge_logger` 调用
