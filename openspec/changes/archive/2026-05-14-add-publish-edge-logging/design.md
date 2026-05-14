## Context

当前 EdgeLogger 已有 `log_edge_operation`（写入 `upstream.log`）和 `log_route_operation`（写入 `route.log`）两个方法。上游和路由的 publish 端点已接入，记录每次推送 Edge 节点的请求/响应/加密体。插件组、全局规则、插件元数据的 publish 端点尚未接入。

## Goals / Non-Goals

**Goals:**
- 插件组、全局规则、插件元数据发布时，对每个 Edge 节点的同步操作写入独立的日志文件
- 日志格式与上游/路由保持一致（时间戳、集群、资源名称、请求方法、请求体、加密体、响应、状态）

**Non-Goals:**
- 不改造现有日志文件结构
- 不涉及前端改动

## Decisions

1. **每个资源类型独立日志文件** — 延续上游（`upstream.log`）和路由（`route.log`）的模式，分别创建 `plugin_config.log`、`global_rule.log`、`plugin_metadata.log`，避免单文件混乱
2. **日志方法签名沿用现有模式** — `log_plugin_config_operation` 参数与 `log_edge_operation` 类似：集群信息、资源 ID/名称、请求方法/路径、请求体、加密体、响应、状态、错误信息
3. **publish 端点改动最小化** — 仅导入 `get_edge_logger`、创建 logger 实例、在 for 循环的 success/fail 分支调用对应日志方法

## Risks / Trade-offs

无显著风险。改动集中在后端三个文件的日志追加，不影响业务逻辑。
