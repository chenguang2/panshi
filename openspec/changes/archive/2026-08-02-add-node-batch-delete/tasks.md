## 1. 后端：批量删除端点

- [x] 1.1 `backend/app/schemas/cluster.py`: 新增 `BatchDeleteNodesRequest(DeleteClusterRequest)`，增加 `node_ids: list[int] = Field(...)`（空列表由端点显式返回 400，不设 min_length 以避免 422，与 `BatchDeleteUpstreamsRequest` 模式一致）
- [x] 1.2 `backend/app/api/v1/cluster_nodes.py`: 新增 `DELETE /clusters/{cluster_id}/nodes` 端点——校验至少 delete_db/delete_edge 其一、node_ids 非空（否则 400）；循环单删逻辑：逐条 try/except + **except 分支 `await db.rollback()`**（防 pending-rollback 拖垮整批）+ **每条节点独立 `db.commit()`**；节点查找用 **`edge_sync.get_or_404(db, Node, id=node_id, cluster_id=cluster_id)`**；**Edge 阶段固定 `skipped`**（节点是 Edge 运行时无 Edge API 删除，与单删一致）；**results 每条显式含 `node_ip` 字段**（供前端 `nameField='node_ip'` 显示）；**message 返回 `批量删除完成: {len(results)} 条节点`**；按 node 分组返回 `results`（含 node_id/node_ip/error/status）
- [x] 1.3 `backend/tests/test_node_batch_delete.py`: 新增批量删除端点测试（镜像 test_node_batch_create.py，复用 test_db fixture）——成功批量删 DB、空 node_ids 400、delete_db/delete_edge 均 false 400、单条失败不阻塞其余（404 节点混入）、**Edge 阶段固定 skipped**、**results 含 node_ip**、DB 异常 rollback 不拖垮后续条目
- [x] 1.4 运行 `cd backend && uv run pytest` 验证后端测试通过（对比基线确认无新增失败）

## 2. 前端：类型与状态初始化

- [x] 2.1 `frontend/src/types/index.ts`: `Cluster` 接口新增 `selectedNodeKeys?: number[]`（紧邻 `selectedNode`，镜像 `selectedRouteKeys`）——`vue-tsc --noEmit` 通过
- [x] 2.2 `frontend/src/views/CentralList.vue`: `loadClusters` 的 cluster map 中初始化 `selectedNodeKeys: []`
- [x] 2.3 检查 Cluster 测试 fixture——若有测试构造完整 Cluster 字面量则补默认值；vitest 基线对比确认类型改动引入 0 新失败

## 3. 前端：composable 双状态联动

- [x] 3.1 `frontend/src/composables/useClusterNodes.ts`: 新增 `selectNodes(cluster, keys, rows)`——设置 `selectedNodeKeys = keys`；`keys.length === 1 ? rows[0] : null` 设置 `selectedNode`（TDD：3 态联动测试先行）
- [x] 3.2 `useClusterNodes.ts`: 新增 `deleteNodes(cluster)`——读取 `selectedNodeKeys` 对应节点，组合确认弹窗标题（≤3 条全列、>3 条截断 + "等 N 条"），调用 `showDeleteConfirm`（**不传 nodes**，与单删一致）→ `executeDeleteWithProgress`（传 `resourceKey: { field: 'node_ids', label: '节点', nameField: 'node_ip', keys }`），`clearSelectedFn` 清空双状态（TDD：标题组合/onOk/resourceKey 测试先行）
- [x] 3.3 `useClusterNodes.ts`: `loadNodes`/`handleNodeTableChange` 中**搜索/排序条件变化时清除 `selectedNodeKeys` 与 `selectedNode`**（D8，镜像 useClusterUpstreams.ts 的 WeakMap 参数对比模式——注意对比**不含 page**，翻页不触发清除）（TDD：搜索/排序清除 + 翻页保留测试先行）
- [x] 3.4 `useClusterNodes.ts`: return 中导出 `selectNodes`、`deleteNodes`（测试通过，vue-tsc 通过）

## 4. 前端：ClusterNodes.vue 表格改造

- [x] 4.1 `ClusterNodes.vue`: `:row-selection` 改为多选——`selectedRowKeys: cluster.selectedNodeKeys || []`、`preserveSelectedRowKeys: true`、`onChange: (keys, rows) => selectNodes(cluster, keys, rows)`（TDD：组件测试先行）
- [x] 4.2 `ClusterNodes.vue`: 新增 `:custom-row="(record) => ({ onClick: () => { cluster.selectedNode = record } })"` 行点击（TDD：组件测试先行）
- [x] 4.3 `ClusterNodes.vue`: 删除按钮分流——`selectedNodeKeys.length > 0` 时文案 `删除节点(N)` 且调 `deleteNodes(cluster)`，否则现状单删 `deleteNode(cluster)`（`handleDeleteClick` + `batchCount`/`deleteCount`/`deleteEnabled` 计算属性，TDD：组件测试先行）
- [x] 4.4 工具条单选按钮（编辑/启动/停止/状态查询）可用性改为 `selectedNodeKeys.length <= 1 && (!!selectedNode || selectedNodeKeys.length === 1)`——勾选 ≥2 时**强制禁用**，行点击不复活（`singleOpEnabled` 计算属性，TDD：组件测试先行，vue-tsc 通过）

## 5. 前端测试

- [x] 5.1 Vitest: `selectNodes` 三态联动、`deleteNodes` 标题组合（≤3 全列、>3 截断）、`executeDeleteWithProgress` resourceKey 传递——useClusterNodes.test 通过
- [x] 5.2 Vitest: 删除按钮分流、单选随批量状态禁用、搜索/排序清除勾选、翻页保留——useClusterNodes.test + ClusterNodes.test 通过
- [x] 5.3 E2E (Playwright): `e2e/node-batch-delete.spec.ts`——批量删除流程（勾选2行→确认弹窗勾"数据库"→进度→勾选清空）、搜索清除勾选。导航到集群详情页节点 Tab；**节点 < 2 时 test.skip，搜索清除节点 < 1 时 skip（镜像 upstream/route E2E）**
- [x] 5.4 运行 `cd frontend && npx vitest run` 验证（基线对比确认 0 新失败）；E2E 通过；`npx vue-tsc --noEmit` 通过

## 6. 规格同步

- [x] 6.1 同步 `openspec/specs/node-batch-delete/spec.md`（新能力：ADDED 全部需求）
- [x] 6.2 同步 `openspec/specs/cluster-nodes-composable/spec.md`——MODIFIED「useClusterNodes composable」（返回值含 selectNodes/deleteNodes + 双状态联动 + 批量删除 + 搜索/排序清除场景）
- [x] 6.3 同步 `openspec/specs/cluster-nodes-component/spec.md`——MODIFIED「ClusterNodes component」（多选 row-selection + customRow 行点击 + 删除按钮分流 + 单选禁用场景）
