## 1. 后端：批量删除端点

- [ ] 1.1 `backend/app/schemas/cluster.py`: 新增 `BatchDeleteRoutesRequest(DeleteClusterRequest)`，增加 `route_ids: list[int] = Field(..., min_length=1)`
- [ ] 1.2 `backend/app/api/v1/cluster_routes.py`: 新增 `DELETE /clusters/{cluster_id}/routes` 端点——校验至少 delete_db/delete_edge 其一、route_ids 非空（否则 400），循环单删逻辑，**每条路由独立 `db.commit()`**、循环体 `except Exception` 穷尽捕获，`edge_uuid` 为空跳过 Edge 同步记 `skipped`，按 route 分组返回 `results`（含 route_id/route_name/error/status）
- [ ] 1.3 `backend/tests/`: 新增批量删除端点测试——成功批量删 DB、空 route_ids 400、delete_db/delete_edge 均 false 400、单条失败不阻塞其余（404 路由混入）、空 edge_uuid 跳过 Edge 同步
- [ ] 1.4 运行 `cd backend && uv run pytest` 验证后端测试通过

## 2. 前端：类型与状态初始化

- [ ] 2.1 `frontend/src/types/index.ts`: `Cluster` 接口新增 `selectedRouteKeys?: number[]`（紧邻 `selectedRoute`）；**修正 `Route.plugins` 类型为 `RoutePlugin[]`**（原错误标注为 `Record<string, any>`）
- [ ] 2.2 `frontend/src/views/CentralList.vue`: `loadClusters` 的 cluster map 中初始化 `selectedRouteKeys: []`（near line 816）
- [ ] 2.3 检查 Cluster 测试 fixture（如 `ClusterNodes.test.ts`）是否需要补 `selectedRouteKeys` 默认值，补齐

## 3. 前端：composable 双状态联动

- [ ] 3.1 `frontend/src/composables/useClusterRoutes.ts`: 新增 `selectRoutes(cluster, keys, rows)`——设置 `selectedRouteKeys = keys`；`keys.length === 1 ? rows[0] : null` 设置 `selectedRoute`
- [ ] 3.2 `useClusterRoutes.ts`: 新增 `deleteRoutes(cluster)`——读取 `selectedRouteKeys` 对应路由，**过滤 DNS 路由并拦截提示**，组合确认弹窗标题（≤3 条全列、>3 条截断 + "等 N 条"），调用 `executeDeleteWithProgress`（扩展 routeIds），`clearSelectedFn` 清空双状态
- [ ] 3.3 `useClusterRoutes.ts`: 提取 `isDnsRoute(record)` 辅助函数（`plugins.some(p => p.plugin_name === 'dns_upstream')`）；**单删路径 `deleteRoute`/`deleteRouteByRecord` 增加 DNS 守卫**（拦截 + 提示"请在 DNS 查询页面管理"）
- [ ] 3.4 `useClusterRoutes.ts`: **`loadRoutes`/`handleRouteTableChange` 搜索或排序条件变化时清除 `selectedRouteKeys` 与 `selectedRoute`**（D9）
- [ ] 3.5 `useClusterRoutes.ts`: return 中导出 `selectRoutes`、`deleteRoutes`

## 4. 前端：ClusterRoutes.vue 表格改造

- [ ] 4.1 `ClusterRoutes.vue`: `:row-selection` 改为多选——`selectedRowKeys: cluster.selectedRouteKeys`、`preserveSelectedRowKeys: true`、`getCheckboxProps: (record) => ({ disabled: isDnsRoute(record) })`、`onChange: (keys, rows) => selectRoutes(cluster, keys, rows)`
- [ ] 4.2 `ClusterRoutes.vue`: 新增 `:custom-row="(record) => ({ onClick: () => { cluster.selectedRoute = record } })"` 行点击
- [ ] 4.3 `ClusterRoutes.vue`: 删除按钮分流——`selectedRouteKeys.length > 0` 时文案 `删除(N)` 且调 `deleteRoutes(cluster)`，否则现状单删 `deleteRoute(cluster)`
- [ ] 4.4 工具条单选按钮（复制/编辑/发布/版本管理）可用性改为 `selectedRouteKeys.length <= 1 && (!!selectedRoute || selectedRouteKeys.length === 1)`——勾选 ≥2 时**强制禁用**，行点击不复活（P2）

## 5. 前端：进度弹窗扩展

- [ ] 5.1 `frontend/src/composables/useClusterUtils.ts`: `DeleteProgressOptions` 增加 `routeIds?: number[]`；`executeDeleteWithProgress` **双模式**——`routeIds` 存在时请求体含 `route_ids`、按 route 分组逐条日志（`删除路由 X: 数据库✅ / Edge node✅`，含 skipped），不存在时维持现有单删按 scope 解析路径，**不得破坏现有 11 处调用方**
- [ ] 5.2 确认 `clearSelectedFn` 在 refreshFn 后调用（useClusterUtils.ts:389-391 现状），批量删除传 `() => { cluster.selectedRouteKeys = []; cluster.selectedRoute = null }`

## 6. 前端：API 客户端

- [ ] 6.1 `frontend/src/api/`: 确认/新增批量删除请求（`api.delete('/clusters/{cid}/routes', { data: { route_ids, delete_db, delete_edge, node_ids } })`），或复用 composable 内联调用（遵循现有直连风格）

## 7. 前端测试

- [ ] 7.1 Vitest: `selectRoutes` 三态联动单元测试（0/1/≥2 勾选）、`deleteRoutes` 标题组合（≤3 全列、>3 截断）、DNS 路由拦截（批量 + 单删）
- [ ] 7.2 Vitest: 删除按钮分流逻辑、单选按钮随批量状态禁用、搜索/排序清除勾选测试
- [ ] 7.3 E2E (Playwright): 集群详情页勾选 ≥2 行 → 批量删除流程（确认弹窗 → 进度 → 列表刷新 → 勾选清空）；DNS 路由 checkbox 禁用 + 单删拦截断言；搜索/排序后勾选清空断言
- [ ] 7.4 运行 `cd frontend && npx vitest run && npx playwright test` 验证

## 8. 规格同步

- [ ] 8.1 归档后同步 `openspec/specs/route-list-selection/spec.md`（批量勾选翻页保留/搜索排序清除、行点击 customRow 驱动、单选仍清空）
- [ ] 8.2 归档后同步 `openspec/specs/cluster-routes-composable/spec.md`（composable 返回值、selectRoutes/deleteRoutes、DNS 守卫）
