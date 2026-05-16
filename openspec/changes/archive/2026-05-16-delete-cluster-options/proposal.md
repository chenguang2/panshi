## Why

当前删除集群时强制同时删除数据库记录和 Edge 节点数据，但用户有时只需要清理数据库（保留 Edge 节点运行状态），或只需要清理 Edge 节点（保留数据库记录做备份）。缺少灵活选择。

## What Changes

- **后端 DELETE /clusters/{id} 增加请求体参数**：`delete_db`（是否删除数据库）、`delete_edge`（是否同步删除 Edge 节点）
- **默认都不选**：两个参数默认 false，弹窗中的确认按钮禁用
- **只选数据库**：后端跳过 Edge 节点同步步骤
- **只选 Edge 节点**：后端跳过数据库删除步骤
- **两个都选**：与现在行为一致
- **前端的确认弹窗**：增加两个 checkbox，根据选择控制 API 调用

## Capabilities

### New Capabilities

- `delete-cluster-options`: 删除集群时支持按需选择删除范围（数据库/Edge 节点/两者）

## Impact

- 后端：修改 `DELETE /clusters/{cluster_id}` 增加请求体
- 前端：修改确认弹窗增加两个 checkbox
