## Why

当前路由删除仅支持单条操作，删除流程重（确认弹窗 → 节点选择 → 进度弹窗），批量清理场景（测试路由下线、旧服务迁移）下操作成本随数量线性放大。集群详情页路由 Tab 是全量路由的天然操作视图，需要批量删除能力。为安全起见，批量删除限定在单集群内（集群详情页路由 Tab），不跨集群。

## What Changes

- 集群详情页路由 Tab（`ClusterRoutes.vue`）新增**双状态选择**：
  - `selectedRoute`（单选）：由**行点击**（`customRow` onClick）驱动，维持并增强现有"点行即选"逻辑，驱动 复制/编辑/发布/版本管理/单删 按钮
  - `selectedRouteKeys: number[]`（批量）：由 **checkbox 勾选**驱动，驱动批量删除按钮
  - 勾选恰好 1 行时同步 `selectedRoute`（维持现状）；勾选 ≥2 行时 `selectedRoute` 置空，**且单选操作按钮（复制/编辑/发布/版本管理）强制禁用**（不随后续行点击复活）
- 删除按钮分流：有批量勾选 → 「删除(N)」批量删除；否则单删（现状）
- 批量勾选使用 `preserveSelectedRowKeys: true`，**翻页保留**；**搜索/排序时自动清除勾选**（防误删筛选结果之外的路由）
- DNS 路由删除策略统一：**批量勾选通过 `getCheckboxProps` 置灰禁用，且单删入口也禁用**（与全局路由页 RouteList 一致——DNS 路由请在 DNS 查询页面管理）
- 确认弹窗标题列出选中路由名称：≤3 条全列，>3 条截断 + "等 N 条"
- 后端新增单集群批量删除端点，逐条 try/except + 每路由独立 commit，单条失败不阻塞其余；`edge_uuid` 为空的路由跳过 Edge 同步并记 `skipped`
- 复用 `executeDeleteWithProgress` 进度弹窗，扩展支持 `routeIds`（双模式解析：批量按 route 分组 vs 单删按 scope，不破坏现有路径）；`clearSelectedFn` 清空双状态

## Capabilities

### New Capabilities
- `route-batch-delete`: 单集群内批量删除路由——前端双状态选择（行点击单选 + checkbox 批量）、删除按钮分流、DNS 路由禁选、跨页保留、确认弹窗名称列表、批量删除 API 及逐条容错、批量进度展示

### Modified Capabilities
- `route-list-selection`: 选择行为变化——新增 checkbox 批量勾选状态（原 spec 仅定义单选切换）；批量勾选**翻页保留、搜索/排序清除**（原 spec 要求"跨页/排序/搜索后选择清除"，现仅对 `selectedRoute` 单选保留该语义）；行点击由 checkbox 驱动改为 `customRow` 驱动
- `cluster-routes-composable`: `useClusterRoutes` 新增批量选择状态与批量删除逻辑（`selectedRouteKeys`、`selectRoutes`、批量删除入口、DNS 单删禁用守卫）

## Impact

- **后端**：`backend/app/api/v1/cluster_routes.py`（新增批量删除端点）、`backend/app/schemas/cluster.py`（新增 `BatchDeleteRoutesRequest(DeleteClusterRequest)` 加 `route_ids: list[int] = Field(..., min_length=1)`）、`backend/tests/`（批量端点测试）
- **前端**：`frontend/src/views/clusters/ClusterRoutes.vue`（row-selection 多选 + customRow + 删除按钮分流 + DNS 单删/批量双禁选）、`frontend/src/composables/useClusterRoutes.ts`（`selectRoutes` 联动、搜索/排序清勾选、批量删除、DNS 守卫）、`frontend/src/composables/useClusterUtils.ts`（`executeDeleteWithProgress` 双模式扩展）、`frontend/src/types/index.ts`（`Cluster.selectedRouteKeys` + 修正 `Route.plugins` 类型为 `RoutePlugin[]`）、`frontend/src/views/CentralList.vue`（loadClusters 初始化 `selectedRouteKeys: []`）、前端单元/E2E 测试
- **API**：新增 `DELETE /clusters/{cluster_id}/routes`（body: `{route_ids, delete_db, delete_edge, node_ids}`）
- **行为变更**：勾选 ≥2 行时单选操作按钮强制禁用（含行点击后）；批量勾选翻页保留、搜索/排序清除；DNS 路由在集群 Tab 单删入口禁用（原可删）
