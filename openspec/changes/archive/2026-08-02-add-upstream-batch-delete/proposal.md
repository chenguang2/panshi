## Why

当前上游删除仅支持单条操作，删除流程重（确认弹窗 → 节点选择 → 进度弹窗），批量清理场景（测试上游下线、旧服务迁移）下操作成本随数量线性放大。集群详情页上游 Tab 是全量上游的天然操作视图，需要批量删除能力。为安全起见，批量删除限定在单集群内（集群详情页上游 Tab），不跨集群。

## What Changes

- 集群详情页上游 Tab（`ClusterUpstreams.vue`）新增**双状态选择**：
  - `selectedUpstream`（单选）：由**行点击**（`customRow` onClick）驱动，维持并增强现有"点行即选"逻辑，驱动 编辑/发布/版本管理/单删 按钮
  - `selectedUpstreamKeys: number[]`（批量）：由 **checkbox 勾选**驱动，驱动批量删除按钮
  - 勾选恰好 1 行时同步 `selectedUpstream`（维持现状）；勾选 ≥2 行时 `selectedUpstream` 置空，**且单选操作按钮（编辑/发布/版本管理）强制禁用**（不随后续行点击复活）
- 删除按钮分流：有批量勾选 → 「删除(N)」批量删除；否则单删（现状）
- 批量勾选使用 `preserveSelectedRowKeys: true`，**翻页保留**；**搜索/排序时自动清除勾选**（防误删筛选结果之外的上游）
- 确认弹窗标题列出选中上游名称：≤3 条全列，>3 条截断 + "等 N 条"
- **关联路由守卫保留（过滤跳过 + 提示）**：批量删除前逐条检查上游是否被路由引用（`routes.some(r => r.upstream_id === upstream.id)`），被引用的上游从待删列表**剔除**并 message.warning 提示（"已被路由引用，已跳过"），仅未引用的进入确认弹窗与请求；全部被引用则直接提示不弹窗。前端守卫尽力而为（懒加载第一页），**后端全量查询兜底且无条件拦截**（与 delete_db/delete_edge 组合无关）
- 后端新增单集群批量删除端点，逐条 try/except + **每条独立 commit + except 分支 rollback**（防止 DB 异常 pending-rollback 拖垮整批，**顺带修复路由批量 delete_routes_batch 同款 bug**）；`edge_uuid` 为空的上游跳过 Edge 同步并记 `skipped`——**批量与单删端点一并补齐**（消除集合级 DELETE 风险）
- 复用 `executeDeleteWithProgress` 进度弹窗，扩展 **`resourceKey` 统一对象**（`{field, label, nameField, keys}`——请求体字段名、日志文案、结果名称字段全参数化，不再硬编码 `route_ids`/“路由”）；`clearSelectedFn` 清空双状态

## Capabilities

### New Capabilities
- `upstream-batch-delete`: 单集群内批量删除上游——前端双状态选择（行点击单选 + checkbox 批量）、删除按钮分流、跨页保留、确认弹窗名称列表、批量删除 API 及逐条容错（含关联路由守卫）、批量进度展示

### Modified Capabilities
- `cluster-upstreams-composable`: `useClusterUpstreams` 新增批量选择状态与批量删除逻辑（`selectedUpstreamKeys`、`selectUpstreams`、`deleteUpstreams`、搜索/排序清除勾选、批量/单删关联路由守卫统一）
- `cluster-upstreams-component`: `ClusterUpstreams` 组件行为变化——新增 checkbox 多选、行点击驱动单选、删除按钮分流（批量优先）

## Impact

- **后端**：`backend/app/api/v1/cluster_upstreams.py`（新增批量删除端点 + **单删端点补 edge_uuid 守卫**）、`backend/app/api/v1/cluster_routes.py`（**顺带修复 delete_routes_batch 的 except rollback**）、`backend/app/schemas/cluster.py`（新增 `BatchDeleteUpstreamsRequest(DeleteClusterRequest)` 加 `upstream_ids: list[int]`）、`backend/tests/test_upstream_batch_delete.py`（批量端点测试）
- **前端**：`frontend/src/views/clusters/ClusterUpstreams.vue`（row-selection 多选 + customRow + 删除按钮分流）、`frontend/src/composables/useClusterUpstreams.ts`（`selectUpstreams` 联动、搜索/排序清勾选、`deleteUpstreams` 批量删除 + 关联路由守卫过滤跳过）、`frontend/src/composables/useClusterUtils.ts`（`DeleteProgressOptions` 增加 `resourceKey` 统一对象、`logBatchDeleteResults` 参数化 field/label/nameField）、`frontend/src/types/index.ts`（`Cluster.selectedUpstreamKeys`）、`frontend/src/views/CentralList.vue`（loadClusters 初始化 `selectedUpstreamKeys: []`）、前端单元/E2E 测试
- **API**：新增 `DELETE /clusters/{cluster_id}/upstreams`（body: `{upstream_ids, delete_db, delete_edge, node_ids}`）
- **行为变更**：勾选 ≥2 行时单选操作按钮强制禁用（含行点击后）；批量勾选翻页保留、搜索/排序清除；删除按钮批量优先
