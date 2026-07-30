## Why

静态资源发布到 Edge 节点时，目前没有任何操作日志。其他资源类型（路由、上游、插件组、全局规则等）在发布时都会将每次 Edge API 调用记录到 `logs/edge/*.log` 文件中，用于审计和问题排查。静态资源发布缺少同样的日志记录，导致无法追溯发布历史、排查节点同步失败原因。

## What Changes

- 在 `EdgeLogger.RESOURCE_LOG_CONFIG` 中新增 `static_resource` 类型的日志配置，写入 `logs/edge/static_resource.log`
- 在 `publish_static_resource` 中添加日志记录逻辑，每次向 Edge 节点发送 zip 文件时记录请求和结果（成功/失败）
- 日志格式与其他资源类型一致：时间戳、集群信息、资源名称、请求方法/PATH、状态码、Status: SUCCESS 或 FAILED

## Capabilities

### New Capabilities
_（无新增 capability，功能属于已有 capability 的修改）_

### Modified Capabilities
- `publish-edge-logging`: 增加 `static_resource` 资源类型的发布日志记录要求
- `cluster-static-resource-publish`: 增加发布操作的 Edge 日志记录要求

## Impact

- `backend/app/services/edge_logger.py` — `RESOURCE_LOG_CONFIG` 增加 `static_resource` 条目
- `backend/app/api/v1/cluster_static_resources.py` — `publish_static_resource` 函数增加日志调用
