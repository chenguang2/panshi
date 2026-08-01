## 1. 后端：批量删除端点

- [x] 1.1 `backend/app/schemas/cluster.py`: 新增 `BatchDeleteRoutesRequest(DeleteClusterRequest)`，增加 `route_ids: list[int] = Field(...)`（空列表由端点显式返回 400，不设 min_length 以避免 422）
- [x] 1.2 `backend/app/api/v1/cluster_routes.py`: 新增 `DELETE /clusters/{cluster_id}/routes` 端点——校验至少 delete_db/delete_edge 其一、route_ids 非空（否则 400），循环单删逻辑，**每条路由独立 `db.commit()`**、循环体 `except Exception` 穷尽捕获，`edge_uuid` 为空跳过 Edge 同步记 `skipped`，按 route 分组返回 `results`（含 route_id/route_name/error/status）
- [x] 1.3 `backend/tests/test_route_batch_delete.py`: 新增批量删除端点测试——成功批量删 DB、空 route_ids 400、delete_db/delete_edge 均 false 400、单条失败不阻塞其余（404 路由混入）、空 edge_uuid 跳过 Edge 同步（6/6 通过）
- [x] 1.4 运行 `cd backend && uv run pytest` 验证后端测试通过（818 passed；24 failed 均为既有失败：网络请求/组过滤/插件开关等领域，与本次改动无关，已用 git stash 基线对比确认）

## 2. 前端：类型与状态初始化

- [x] 2.1 `frontend/src/types/index.ts`: `Cluster` 接口新增 `selectedRouteKeys?: number[]`（紧邻 `selectedRoute`）；**修正 `Route.plugins` 类型为 `RoutePlugin[]`**（原错误标注为 `Record<string, any>`）——`vue-tsc --noEmit` 通过
- [x] 2.2 `frontend/src/views/CentralList.vue`: `loadClusters` 的 cluster map 中初始化 `selectedRouteKeys: []`（line 817）
- [x] 2.3 检查 Cluster 测试 fixture——无测试文件引用 `selectedRoute`/构造完整 Cluster 字面量（均用 mock/any），无需补默认值；vitest 基线对比确认类型改动引入 0 新失败

## 3. 前端：composable 双状态联动

- [x] 3.1 `frontend/src/composables/useClusterRoutes.ts`: 新增 `selectRoutes(cluster, keys, rows)`——设置 `selectedRouteKeys = keys`；`keys.length === 1 ? rows[0] : null` 设置 `selectedRoute`（TDD：3 态联动测试先行）
- [x] 3.2 `useClusterRoutes.ts`: 新增 `deleteRoutes(cluster)`——读取 `selectedRouteKeys` 对应路由，**过滤 DNS 路由并拦截提示**，组合确认弹窗标题（≤3 条全列、>3 条截断 + "等 N 条"），调用 `executeDeleteWithProgress`（扩展 routeIds），`clearSelectedFn` 清空双状态（TDD：标题组合/DNS 拦截/onOk 测试先行）
- [x] 3.3 `useClusterRoutes.ts`: 提取 `isDnsRoute(record)` 辅助函数（`plugins.some(p => p.plugin_name === 'dns_upstream')`）；**单删路径 `deleteRoute`/`deleteRouteByRecord` 增加 DNS 守卫**（拦截 + 提示"请在 DNS 查询页面管理"）（TDD：守卫测试先行）
- [x] 3.4 `useClusterRoutes.ts`: **`loadRoutes` 用 WeakMap 记录上次查询参数，搜索/排序条件变化时清除 `selectedRouteKeys` 与 `selectedRoute`**（D9）（TDD：搜索/排序清除测试先行）
- [x] 3.5 `useClusterRoutes.ts`: return 中导出 `selectRoutes`、`deleteRoutes`、`isDnsRoute`（15/15 测试通过，vue-tsc 通过）

## 4. 前端：ClusterRoutes.vue 表格改造

- [x] 4.1 `ClusterRoutes.vue`: `:row-selection` 改为多选——`selectedRowKeys: cluster.selectedRouteKeys`、`preserveSelectedRowKeys: true`、`getCheckboxProps: (record) => ({ disabled: isDnsRoute(record) })`、`onChange: (keys, rows) => selectRoutes(cluster, keys, rows)`（TDD：组件测试先行）
- [x] 4.2 `ClusterRoutes.vue`: 新增 `:custom-row="(record) => ({ onClick: () => { cluster.selectedRoute = record } })"` 行点击（TDD：组件测试先行）
- [x] 4.3 `ClusterRoutes.vue`: 删除按钮分流——`selectedRouteKeys.length > 0` 时文案 `删除(N)` 且调 `deleteRoutes(cluster)`，否则现状单删 `deleteRoute(cluster)`（`handleDeleteClick` + `deleteCount` 计算属性，TDD：组件测试先行）
- [x] 4.4 工具条单选按钮（复制/编辑/发布/版本管理）可用性改为 `selectedRouteKeys.length <= 1 && (!!selectedRoute || selectedRouteKeys.length === 1)`——勾选 ≥2 时**强制禁用**，行点击不复活（`singleOpEnabled` 计算属性，TDD：组件测试先行，5/5 通过，vue-tsc 通过）

## 5. 前端：进度弹窗扩展

- [x] 5.1 `frontend/src/composables/useClusterUtils.ts`: `DeleteProgressOptions` 增加 `routeIds?: number[]`；`executeDeleteWithProgress` **双模式**——`routeIds` 存在时请求体含 `route_ids`、按 route 分组逐条日志（`删除路由 X: 数据库✅ / Edge node✅`，含 skipped），不存在时维持现有单删按 scope 解析路径（抽为 `logSingleDeleteResults`，行为不变）（TDD：批量模式 + 单删回归 4/4 测试通过）
- [x] 5.2 确认 `clearSelectedFn` 在 refreshFn 后调用（useClusterUtils.ts 现有顺序 afterDelete → refreshFn → clearSelectedFn，测试断言验证）

## 6. 前端：API 客户端

- [x] 6.1 确认：批量删除请求已由 composable 内联实现（`useClusterRoutes.deleteRoutes` → `executeDeleteWithProgress` → `api.delete('/clusters/{cid}/routes', { data: { route_ids, ... } })`），遵循现有直连风格（与路由/上游等其他资源一致，无需独立 API 文件），已由 useClusterRoutes.test + useClusterUtils.test 断言验证

## 7. 前端测试

- [x] 7.1 Vitest: `selectRoutes` 三态联动、`deleteRoutes` 标题组合（≤3 全列、>3 截断）、DNS 拦截（批量 + 单删）——useClusterRoutes.test 15/15 通过
- [x] 7.2 Vitest: 删除按钮分流、单选随批量状态禁用、搜索/排序清除勾选——useClusterRoutes.test（D9 清除）+ ClusterRoutes.test（按钮分流/P2 禁用）5/5 通过
- [x] 7.3 E2E (Playwright): `e2e/route-batch-delete.spec.ts` **3/3 通过**——批量删除流程（勾选2行→确认弹窗勾"数据库"→进度→勾选清空）、搜索清除勾选（D9）、DNS checkbox 禁用。环境已修复：`@playwright/test` 从 `^1.59.1` 升级到 `^1.62.1` 与 `playwright` 对齐（消除双版本冲突，bin 指向一致，浏览器 1234 版复用）。测试导航修正为 `/central-management`（CentralList 的集群展开视图，ClusterRoutes 所在处）；排查中发现 D9 真实场景缺陷（ClusterRoutes mount 不加载数据，WeakMap 基线未建立 → 搜索/排序清除失效），已修复：搜索 `@search` handler + `handleRouteTableChange` 排序分支显式清除双状态
- [x] 7.4 运行 `cd frontend && npx vitest run` 验证（398 passed / 11 failed 均为既有失败，基线对比确认 0 新失败；**E2E 3/3 通过**）

## 8. 规格同步

- [x] 8.1 已同步 `openspec/specs/route-list-selection/spec.md`——MODIFIED「Route list single-select switching」（customRow 驱动说明 + 单选跨页/排序/搜索清空 + 勾选≥2 时单选清空/按钮禁用场景）+ ADDED「Route batch selection」（勾选切换/单行同步/翻页保留/搜索排序清除/DNS 禁选/删除后清空）
- [x] 8.2 已同步 `openspec/specs/cluster-routes-composable/spec.md`——MODIFIED「useClusterRoutes composable」（返回值含 selectRoutes/deleteRoutes + selectRoutes 双状态联动 + deleteRoutes 批量删除 + 批量/单删 DNS 守卫场景）
