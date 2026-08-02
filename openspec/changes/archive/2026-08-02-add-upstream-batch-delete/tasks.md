## 1. 后端：批量删除端点 + 守卫修复

- [x] 1.1 `backend/app/schemas/cluster.py`: 新增 `BatchDeleteUpstreamsRequest(DeleteClusterRequest)`，增加 `upstream_ids: list[int] = Field(...)`（空列表由端点显式返回 400，不设 min_length 以避免 422，与 `BatchDeleteRoutesRequest` 模式一致）
- [x] 1.2 `backend/app/api/v1/cluster_upstreams.py`: 新增 `DELETE /clusters/{cluster_id}/upstreams` 端点——校验至少 delete_db/delete_edge 其一、upstream_ids 非空（否则 400）；`active_nodes` 循环外取一次；循环体**关联路由守卫（无条件，与 delete_db/delete_edge 组合无关）**（查 `Route.upstream_id == id`，被引用记 failed `"该上游已被路由引用"`）+ 逐条 try/except + **except 分支 `await db.rollback()`**（防 pending-rollback 拖垮整批）+ **每条上游独立 `db.commit()`** + 手动删 `UpstreamTarget`/`ConfigVersion`/`Upstream`（SQLite async 无 FK cascade）；`edge_uuid` 为空跳过 Edge 同步记 `skipped`；`get_or_404` 混入他集群 id 计入失败不阻塞其余；按 upstream 分组返回 `results`（含 upstream_id/upstream_name/error/status）
- [x] 1.3 `backend/app/api/v1/cluster_upstreams.py`: **单删端点 `delete_upstream` 补 `edge_uuid` 守卫**——空 edge_uuid 时跳过 Edge 同步记 `{"scope":"edge","status":"skipped"}`，消除集合级 DELETE 风险（edge_client.py:312-315）
- [x] 1.4 `backend/app/api/v1/cluster_routes.py`: **顺带修复 `delete_routes_batch` 的 except 分支**——补 `await db.rollback()`（同款 pending-rollback bug，cluster_routes.py:353-356）
- [x] 1.5 `backend/tests/test_upstream_batch_delete.py`: 新增批量删除端点测试（镜像 test_route_batch_delete.py，patch `app.services.edge_sync.EdgeClient`）——成功批量删 DB、空 upstream_ids 400、delete_db/delete_edge 均 false 400、单条失败不阻塞其余（404 上游混入）、**被路由引用的上游记 failed（无条件，含只删 Edge 场景）**、空 edge_uuid 跳过 Edge 同步（批量 + 单删）、**DB 异常后 rollback 不拖垮后续条目**；`test_route_batch_delete.py` 补充 rollback 回归断言
- [x] 1.6 运行 `cd backend && uv run pytest` 验证后端测试通过（对比基线确认无新增失败）

## 2. 前端：类型与状态初始化

- [x] 2.1 `frontend/src/types/index.ts`: `Cluster` 接口新增 `selectedUpstreamKeys?: number[]`（紧邻 `selectedUpstream`，镜像 `selectedRouteKeys`）——`vue-tsc --noEmit` 通过
- [x] 2.2 `frontend/src/views/CentralList.vue`: `loadClusters` 的 cluster map 中初始化 `selectedUpstreamKeys: []`
- [x] 2.3 检查 Cluster 测试 fixture——若有测试构造完整 Cluster 字面量则补默认值；vitest 基线对比确认类型改动引入 0 新失败

## 3. 前端：composable 双状态联动

- [x] 3.1 `frontend/src/composables/useClusterUpstreams.ts`: 新增 `selectUpstreams(cluster, keys, rows)`——设置 `selectedUpstreamKeys = keys`；`keys.length === 1 ? rows[0] : null` 设置 `selectedUpstream`（TDD：3 态联动测试先行）
- [x] 3.2 `useClusterUpstreams.ts`: 新增 `deleteUpstreams(cluster)`——读取 `selectedUpstreamKeys` 对应上游，**关联路由守卫"过滤跳过 + 提示"**（懒加载 routes 第一页尽力而为；`r.upstream_id === upstream.id` 的从待删列表剔除 + `message.warning` 列出；全部被引用则直接提示不弹窗；仅未引用的进确认弹窗标题——≤3 条全列、>3 条截断 + "等 N 条"），调用 `executeDeleteWithProgress`（传 `resourceKey: { field: 'upstream_ids', label: '上游', nameField: 'upstream_name', keys }`），`clearSelectedFn` 清空双状态（TDD：标题组合/过滤跳过提示/全被引用不弹窗/onOk 测试先行）
- [x] 3.3 `useClusterUpstreams.ts`: `loadUpstreams`/`handleUpstreamTableChange` 中**搜索/排序条件变化时清除 `selectedUpstreamKeys` 与 `selectedUpstream`**（D9，镜像 useClusterRoutes.ts 的 WeakMap 参数对比模式——注意对比**不含 page**，翻页不触发清除，单选与批量统一"翻页保留、搜索/排序清空"）（TDD：搜索/排序清除 + 翻页保留测试先行）
- [x] 3.4 `useClusterUpstreams.ts`: return 中导出 `selectUpstreams`、`deleteUpstreams`（测试通过，vue-tsc 通过）

## 4. 前端：ClusterUpstreams.vue 表格改造

- [x] 4.1 `ClusterUpstreams.vue`: `:row-selection` 改为多选——`selectedRowKeys: cluster.selectedUpstreamKeys || []`、`preserveSelectedRowKeys: true`、`onChange: (keys, rows) => selectUpstreams(cluster, keys, rows)`（TDD：组件测试先行）
- [x] 4.2 `ClusterUpstreams.vue`: 新增 `:custom-row="(record) => ({ onClick: () => { cluster.selectedUpstream = record } })"` 行点击（TDD：组件测试先行）
- [x] 4.3 `ClusterUpstreams.vue`: 删除按钮分流——`selectedUpstreamKeys.length > 0` 时文案 `删除上游(N)` 且调 `deleteUpstreams(cluster)`，否则现状单删 `deleteUpstream(cluster)`（`handleDeleteClick` + `batchCount`/`deleteCount`/`deleteEnabled` 计算属性，TDD：组件测试先行）
- [x] 4.4 工具条单选按钮（编辑/发布/版本管理）可用性改为 `selectedUpstreamKeys.length <= 1 && (!!selectedUpstream || selectedUpstreamKeys.length === 1)`——勾选 ≥2 时**强制禁用**，行点击不复活（`singleOpEnabled` 计算属性，TDD：组件测试先行，vue-tsc 通过）

## 5. 前端：进度弹窗扩展（resourceKey 统一对象）

- [x] 5.1 `frontend/src/composables/useClusterUtils.ts`: `DeleteProgressOptions` 增加 **`resourceKey?: { field: string; label: string; nameField: string; keys: number[] }`**（替换初版 `routeIds` + `resourceLabel` 组合）；`executeDeleteWithProgress` 按 `resourceKey.field` 动态拼装请求体字段（不再硬编码 `route_ids`，useClusterUtils.ts:330）、批量模式按 `resourceKey.nameField`/`label` 解析逐条日志（`删除上游 X: 数据库✅ / Edge node✅`，含 skipped，useClusterUtils.ts:364-377 参数化）；无 `resourceKey` 时维持现有单删按 scope 解析路径（行为不变）——**路由批量调用方改用 `{ field: 'route_ids', label: '路由', nameField: 'route_name', keys }`，不得破坏现有行为**（TDD：上游批量模式 + 路由批量回归 + 单删回归测试通过）
- [x] 5.2 确认 `clearSelectedFn` 在 refreshFn 后调用（useClusterUtils.ts 现有顺序 afterDelete → refreshFn → clearSelectedFn，测试断言验证）

## 6. 前端测试

- [x] 6.1 Vitest: `selectUpstreams` 三态联动、`deleteUpstreams` 标题组合（≤3 全列、>3 截断）、关联路由守卫（**过滤跳过 + 全部被引用不弹窗** + 单删拦截）——useClusterUpstreams.test 通过
- [x] 6.2 Vitest: 删除按钮分流、单选随批量状态禁用、搜索/排序清除勾选、**翻页保留**——useClusterUpstreams.test + ClusterUpstreams.test 通过
- [x] 6.3 E2E (Playwright): `e2e/upstream-batch-delete.spec.ts`——批量删除流程（勾选2行→确认弹窗勾"数据库"→进度→勾选清空）、搜索清除勾选、被路由引用上游过滤跳过提示。导航到集群详情页上游 Tab
- [x] 6.4 运行 `cd frontend && npx vitest run` 验证（基线对比确认 0 新失败）；E2E 通过

## 7. 规格同步

- [x] 7.1 同步 `openspec/specs/upstream-batch-delete/spec.md`（新能力：ADDED 全部需求）
- [x] 7.2 同步 `openspec/specs/cluster-upstreams-composable/spec.md`——MODIFIED「useClusterUpstreams composable」（返回值含 selectUpstreams/deleteUpstreams + 双状态联动 + 批量删除 + 关联路由守卫过滤跳过场景）
- [x] 7.3 同步 `openspec/specs/cluster-upstreams-component/spec.md`——MODIFIED「ClusterUpstreams component」（多选 row-selection + customRow 行点击 + 删除按钮分流 + 单选禁用场景）
