## Why

集群配置通过平台下发到 Edge 节点后，可能由于网络问题、手动修改或其他原因导致 Edge 节点上的实际运行配置与数据库中的记录不一致。需要提供对比工具让运维人员能直观地发现差异并排查问题。

## What Changes

1. 集群节点操作列新增"数据库对比"按钮
2. 后端提供对比 API：拉取数据库配置 + 调用 Edge 节点 API 获取运行配置 → 对比返回差异结果
3. 前端展示对比结果：按资源类型分组，逐条展示 DB 与 Edge 的差异，原地展开查看详情

## Capabilities

### New Capabilities
- `config-diff`: 数据库与 Edge 节点配置对比能力

## Impact

- 后端新增 `GET /clusters/{id}/nodes/{node_id}/diff` API
- EdgeClient 新增批量拉取所有配置的方法（已有 list_* 方法，需组合使用）
- 前端 ClusterList.vue 节点操作列加按钮 + 新的对比结果视图组件
