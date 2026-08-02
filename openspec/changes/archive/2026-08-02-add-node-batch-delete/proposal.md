## Why

当前集群节点删除仅支持单条操作：需先选中单个节点，再走确认弹窗 → 进度弹窗流程。批量下线场景（节点扩容回退、机房下线、批量替换）下操作成本随数量线性放大。集群详情页节点 Tab 是全量节点的天然操作视图，需要批量删除能力。为安全起见，批量删除限定在单集群内（集群详情页节点 Tab），不跨集群。

## What Changes

- 集群详情页节点 Tab（`ClusterNodes.vue`）新增**双状态选择**：
  - `selectedNode`（单选）：由**行点击**（`customRow` onClick）驱动，维持并增强现有"点行即选"逻辑，驱动 编辑/启动/停止/状态查询/单删 按钮
  - `selectedNodeKeys: number[]`（批量）：由 **checkbox 勾选**驱动，驱动批量删除按钮
  - 勾选恰好 1 行时同步 `selectedNode`（维持现状）；勾选 ≥2 行时 `selectedNode` 置空，**且单选操作按钮（编辑/启动/停止/状态查询）强制禁用**（不随后续行点击复活）
- 删除按钮分流：有批量勾选 → 「删除(N)」批量删除；否则单删（现状）
- 批量勾选使用 `preserveSelectedRowKeys: true`，**翻页保留**；**搜索/排序时自动清除勾选**（防误删筛选结果之外的节点）
- 确认弹窗标题列出选中节点 IP：≤3 条全列，>3 条截断 + "等 N 条"
- 后端新增单集群批量删除端点 `DELETE /clusters/{cluster_id}/nodes`，逐条 try/except + 每节点独立 commit，单条失败不阻塞其余；**Edge 阶段固定 `skipped`**（节点是 Edge 运行时，无对应 Edge API 删除，与单删一致）
- 复用 `executeDeleteWithProgress` 进度弹窗，扩展 `resourceKey` 批量模式（field/label/nameField）；`clearSelectedFn` 清空双状态

## Capabilities

### New Capabilities
- `node-batch-delete`: 单集群内批量删除节点——前端双状态选择（行点击单选 + checkbox 批量）、删除按钮分流、跨页保留、确认弹窗 IP 列表、批量删除 API 及逐条容错、批量进度展示

### Modified Capabilities
- `cluster-nodes-composable`: `useClusterNodes` 新增批量选择状态与批量删除逻辑（`selectedNodeKeys`、`selectNodes`、`deleteNodes`、搜索/排序清除勾选）
- `cluster-nodes-component`: `ClusterNodes` 组件行为变化——新增 checkbox 多选、行点击驱动单选、删除按钮分流（批量优先）

## Impact

- **后端**：`backend/app/api/v1/cluster_nodes.py`（新增批量删除端点）、`backend/app/schemas/cluster.py`（新增 `BatchDeleteNodesRequest(DeleteClusterRequest)` 加 `node_ids: list[int]`）、`backend/tests/test_node_batch_delete.py`（批量端点测试）
- **前端**：`frontend/src/views/clusters/ClusterNodes.vue`（row-selection 多选 + customRow + 删除按钮分流）、`frontend/src/composables/useClusterNodes.ts`（`selectNodes` 联动、搜索/排序清勾选、`deleteNodes` 批量删除）、`frontend/src/types/index.ts`（`Cluster.selectedNodeKeys`）、`frontend/src/views/CentralList.vue`（loadClusters 初始化 `selectedNodeKeys: []`）、前端单元/E2E 测试
- **API**：新增 `DELETE /clusters/{cluster_id}/nodes`（body: `{node_ids, delete_db, delete_edge, node_ids}`）
- **行为变更**：勾选 ≥2 行时单选操作按钮强制禁用（含行点击后）；批量勾选翻页保留、搜索/排序清除；删除按钮批量优先
- **无数据库变更、无新依赖**（复用现有 `executeDeleteWithProgress`/`showDeleteConfirm` 管线）
