## Why

当前集群删除功能存在安全隐患：`DELETE /clusters/{id}` 只有简单确认弹窗，没有展示关联资源数量，没有输入名称二次确认，也没有同步清理 Edge 节点上的配置。用户可能误删包含大量资源的集群。

## What Changes

1. **后端新增 `GET /clusters/{id}/stats` 接口** — 返回集群下所有关联资源的计数
2. **改造 `DELETE /clusters/{id}` 后端** — 增加级联删除子资源 + 同步清理 Edge 节点
3. **前端删除弹窗分两步**：Step 1 资源统计确认弹窗（含输入集群名称二次确认）→ Step 2 进度日志弹窗

## Capabilities

### New Capabilities
- `cluster-delete-stats`: 删除集群前展示资源清单和二次确认

### Modified Capabilities
（无）

## Impact

- `backend/app/api/v1/clusters.py` — 新增 stats 端点，改造 delete 端点
- `frontend/src/views/ClusterList.vue` — 重写 deleteCluster 为两步弹窗
- 无新增依赖
