# Proposal: upstream-publish-to-edge

## Why

上游发布功能需要将配置同步到所有 edge 服务器节点。当前发布流程只保存版本记录，未实际同步到 edge 服务器，导致配置未能生效。

## What Changes

- 修改 `publish_upstream` API，集成 edge 同步能力
- 遍历集群中所有状态为启动的节点，同步上游配置到每个节点
- 添加日志记录功能，详细记录请求/响应并写入 `logs/edge/upstream.log`
- 返回同步结果（成功/失败），失败时提供具体错误信息

## Capabilities

### New Capabilities

- **`edge-logging`**: Edge 操作日志模块
  - 记录每次 edge API 调用的请求和响应
  - 日志文件路径：`logs/edge/upstream.log`
  - 包含时间戳、集群信息、上游信息、请求体、响应体、状态

### Modified Capabilities

- **`upstream-sync`**: 扩展为支持批量同步到多个 edge 节点
  - 将上游配置发布到集群中所有状态为启动的节点
  - 汇总每个节点的结果，返回成功/失败统计

## Impact

- 修改 `backend/app/api/v1/clusters.py` 的 `publish_upstream` 端点
- 新增 `backend/app/services/edge_logger.py` 日志模块
- 需要确保 `logs/edge/` 目录存在
- 不再是单节点同步，而是集群级别批量同步