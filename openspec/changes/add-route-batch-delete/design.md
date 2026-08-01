## Context

路由删除当前仅支持单条：`ClusterRoutes.vue` 表格的 `row-selection` 是"伪单选"（checkbox 外观但只存 1 条，`onChange` 取 `rows[rows.length-1]`），工具栏 复制/编辑/删除/发布/版本管理 全部依赖 `cluster.selectedRoute`。删除管线（`showDeleteConfirm` → `executeDeleteWithProgress`）已成熟，且 `clearSelectedFn` 回调本就是为批量勾选清理预留的。

ant-design-vue 4.2.6 能力边界（已从安装源码确认）：
- **无 `selectRowByClick`**（React 版才有）——行点击天然不触发 checkbox，两通道独立
- checkbox 单元格 `stopPropagation`（`useSelection.js:410`）——点 checkbox 不会冒泡到行，点行不会勾 checkbox，双状态零冲突
- 行点击官方 API 是 `customRow` prop（Table.d.ts:70-73），返回 `{ onClick, ... }` 绑定 `<tr>`
- `preserveSelectedRowKeys`、`getCheckboxProps` 在 4.2.6 均存在（interface.d.ts:122,127）

约束：批量删除限定单集群（集群详情页路由 Tab），不跨集群；遵循 AGENTS.md「删除流程统一用 useClusterUtils.ts 共享函数」约定。

## Goals / Non-Goals

**Goals:**
- 单集群内批量删除路由，逐条容错，失败不阻塞
- 维持并增强"点行即选"单选逻辑（编辑/发布/复制/版本管理 照旧）
- 批量勾选跨页保留（服务端分页）
- DNS 路由不可勾选
- 复用现有确认弹窗 + 进度弹窗管线

**Non-Goals:**
- 跨集群批量删除（全局路由页 RouteList.vue 不在本次范围）
- 批量发布 / 批量复制等其他批量操作
- 节点级别的 Edge 同步细分（批量确认弹窗不按集群分组选节点）

## Decisions

### D1: 双状态选择模型（selectedRoute + selectedRouteKeys）
**决策**：保留 `cluster.selectedRoute`（单选，行点击驱动）作为单选操作对象；新增 `cluster.selectedRouteKeys: number[]`（checkbox 驱动）作为批量对象。`selectRoutes` 联动：勾选 1 行 → `selectedRoute = rows[0]`（维持现状）；勾选 ≥2 行 → `selectedRoute = null`（单选按钮经现有 `:disabled="!cluster.selectedRoute"` 自然禁用）。
**补充（P2 决策）**：单选按钮的禁用不能仅依赖 `selectedRoute`——勾选 ≥2 行后用户点击行会让 `customRow` 重新设置 `selectedRoute`，导致单选按钮"复活"。因此单选操作按钮（复制/编辑/发布/版本管理）的可用性须显式绑定批量状态：`selectedRouteKeys.length <= 1 && (!!selectedRoute || selectedRouteKeys.length === 1)`，即勾选 ≥2 行时**强制禁用**，无论 `selectedRoute` 是否有值。
**理由**：antd-vue 4.x 无 `selectRowByClick`，行点击（customRow）与 checkbox（rowSelection.onChange）是天然独立的事件通道，双状态零冲突。此模式与真实后台项目一致（yudao-ui-admin-vue3 的 `currentRow` + `selectedRadioId`、1Panel 的 `currentRow` + `selects`）。
**备选**：a) 单一 `selectedRowKeys` 驱动一切 → 编辑/发布退化为"必须恰好选 1 条"，破坏现有 UX，否决；b) 批量模式切换（点按钮进入多选态）→ 增加模式状态复杂度，否决；c) 双勾选列 → UI 混乱，否决。

### D2: 行点击用 customRow 驱动 selectedRoute
**决策**：表格加 `:custom-row="(record) => ({ onClick: () => { cluster.selectedRoute = record } })"`。
**理由**：现状"选中"实际靠点 checkbox 列触发（无 customRow、无 selectRowByClick），点行本身无效果。加 customRow 后"点行即选"是从无到有的增强。
**风险**：checkbox 点击已 stopPropagation，不会误触行点击。

### D3: 批量删除按钮分流
**决策**：删除按钮逻辑——`selectedRouteKeys.length > 0` → 批量删除（按钮文案 `删除(N)`）；否则 `selectedRoute` → 单删（现状）。
**理由**：批量优先于单选，避免勾选后误删单选目标；无批量勾选时行为与现状完全一致。

### D4: 跨页保留 preserveSelectedRowKeys: true（翻页保留、搜索/排序清除）
**决策**：rowSelection 设置 `preserveSelectedRowKeys: true`。
**理由**：服务端分页下，antd-vue 默认 `onChange` 会过滤掉非当前页 key（useSelection.js:138-148），勾选跨页会静默丢失；`preserveSelectedRowKeys` 配合 `preserveRecordsRef` 缓存保留全部 key（useSelection.js:49-67）。
**补充（P3 决策）**：勾选仅"翻页保留"；**搜索/排序时自动清除** `selectedRouteKeys`（在 `loadRoutes` 中检测 search/sort 参数变化时清空）。理由：翻页是同数据集不同页，保留合理；搜索/排序改变数据集，保留会误删筛选结果之外的路由（防呆）。此语义与 `selectedRoute` 单选"翻页清空"不完全一致——单选翻页清空（行不可见），批量翻页保留（key 持久），两者由各自状态管理。
**影响**：此行为与既有 `route-list-selection` spec（"跨页/排序/搜索后选择清除"）冲突，该 spec 的批量勾选语义将修改为"翻页保留、搜索/排序清除"；`selectedRoute` 单选仍维持"翻页/排序/搜索清空"语义。
**备选**：全保留（搜索/排序也保留勾选）→ 搜索后删除会连带筛选外路由，仅靠确认弹窗列表兜底，否决；全清除（翻页也清）→ 与用户决策相悖，否决。

### D5: DNS 路由禁选 getCheckboxProps + 单删统一禁用
**决策**：`getCheckboxProps: (record) => ({ disabled: isDnsRoute(record) })`。
**补充（P1 决策）**：DNS 路由删除策略在集群 Tab 统一为**禁止删除**——批量勾选禁选 + **单删入口同样禁用**（操作按钮置灰或提示"这是一条 DNS 查询路由，请在 DNS 查询页面管理"），与全局页 RouteList（RouteList.vue:93-111 完全禁止 DNS 路由操作）行为一致。`isDnsRoute(record)` 判定：`Array.isArray(record.plugins) && record.plugins.some(p => p.plugin_name === 'dns_upstream')`。
**理由**：现状集群 Tab 单删允许 DNS（无守卫）是与全局页的矛盾行为；批量删除是危险操作，统一禁删更安全。
**已验证事实**：集群列表端点 `GET /clusters/{cid}/routes` 响应包含 plugins（仅 `plugin_name`，无 config），故 `isDnsRoute` 可同步在 `getCheckboxProps` 中运行，无需额外请求。`Route.plugins` TS 类型标注错误（`Record<string, any>` vs 实际数组 `RoutePlugin[]`），实现时需修正类型或断言。

### D6: 后端批量端点 DELETE /clusters/{cluster_id}/routes
**决策**：新增端点，body 为 `BatchDeleteRoutesRequest(DeleteClusterRequest)` 加 `route_ids: list[int] = Field(..., min_length=1)`（Pydantic 继承是既有模式，如 `UpstreamWithTargets(UpstreamResponse)`；`DeleteClusterRequest` 已在 cluster_routes.py:12 导入）。循环现有单删逻辑（cluster_routes.py:267-297），**每条路由独立 `db.commit()`**（与单删一致：DB 先于 Edge 提交），逐条 try/except，返回按 route 分组的 `results`。
**补充（T1/P4 决策）**：
- 循环体用 `except Exception`（穷尽捕获）——全局异常处理器（main.py:50-55）会把未捕获异常转 500，单条失败必须隔离
- `edge_uuid` 为空/None 的路由**跳过 Edge 同步**并记 `{"scope":"edge","status":"skipped","message":"该路由无 edge_uuid，跳过 Edge 同步"}`——`delete_on_nodes`（edge_sync.py:103-139）不校验 edge_uuid，空值会静默发集合级 `DELETE /edge/admin/routes`（edge_client.py:312 的 `if resource_id:` 对空串为假），是隐藏炸弹
- `get_or_404` 抛 `HTTPException(404, "路由不存在")`，混入他集群 id 时该条计入失败，不阻塞其余
**理由**：单集群内批量，一次请求、进度连续；逐条容错避免"一条失败全盘失败"。
**备选**：前端循环单删端点 N 次 → N 个进度弹窗、部分失败处理复杂，否决。
**风险**：路由属于同一集群（前端从该集群路由列表勾选），`route_ids` 中混入他集群 id 时 `get_or_404` 报"路由不存在"→ 该条计入失败结果，不阻塞其余。

### D7: 复用 executeDeleteWithProgress 扩展 routeIds（双模式）
**决策**：`DeleteProgressOptions` 增加可选 `routeIds?: number[]`；批量模式解析按 route 分组的 results 并逐条日志；`clearSelectedFn` 传 `() => { cluster.selectedRouteKeys = []; cluster.selectedRoute = null }`。
**补充（T6 决策）**：`executeDeleteWithProgress` 实现双模式解析——`routeIds` 存在时按 route 分组逐条日志（`删除路由 X: 数据库✅ / Edge node✅`，含 skipped），不存在时维持现有单删按 scope 解析路径（useClusterUtils.ts:333-367），**不得破坏现有单删调用方**（RouteList/UpstreamList 等 11 处）。
**理由**：遵循 AGENTS.md「删除流程统一用 useClusterUtils.ts 共享函数」；`clearSelectedFn` 在 refreshFn 之后调用（useClusterUtils.ts:389-391），正好清空双状态。

### D8: 确认弹窗名称列表
**决策**：批量删除确认弹窗标题组合选中路由名称——≤3 条全列，>3 条截断 + "等 N 条"。复用 `showDeleteConfirm` 的 `title` 字符串传参，不改弹窗组件。
**理由**：安全诉求（误删风险），名称可见 + 数量明确；改动最小。

### D9: 搜索/排序清除批量勾选（P3 决策落地）
**决策**：`loadRoutes` 中检测到搜索条件（`routesSearch`/`routesSearchField`）或排序条件（`routesSortBy`/`routesSortOrder`）变化时，清除 `selectedRouteKeys`（及 `selectedRoute`）。
**理由**：搜索/排序改变数据集，保留勾选会误删筛选结果之外的路由。与 D4"翻页保留"形成完整语义：**翻页保留、搜索/排序清除**。
**实现**：在 `handleRouteTableChange` 排序分支与搜索触发处（ClusterRoutes.vue:41）清空双状态，或对比新旧参数值变化时清空。

## Risks / Trade-offs

- [`route-list-selection` spec 语义冲突] → proposal/design 已标记 Modified，实现时同步更新该 spec（批量勾选翻页保留/搜索排序清除、行点击改 customRow 驱动、单选仍清空）
- [DNS 路由判定逻辑分散] → 抽 `isDnsRoute(record)` 辅助函数（检查 `plugins.some(p => p.plugin_name === 'dns_upstream')`），RouteList 与 ClusterRoutes 共用；`Route.plugins` TS 类型修正为 `RoutePlugin[]`
- [批量删除 Edge 同步失败] → 逐条 results 携带 error，进度弹窗标红提示"请手动清理"（现有 executeDeleteWithProgress 已处理）
- [空 edge_uuid 静默发集合级 DELETE] → D6 守卫：跳过并记 `skipped`
- [勾选多行后单选按钮复活] → D1 补充：单选按钮可用性显式绑定批量状态，勾选 ≥2 强制禁用
- [搜索/排序后勾选残留误删] → D9：搜索/排序时清空勾选
- [跨页勾选残留：某路由在翻页/搜索后被后端删除] → 删除时后端逐条 404 计入失败；`clearSelectedFn` 删除成功后清空全量勾选
- [批量循环未捕获异常转 500] → D6：循环体 `except Exception` 穷尽捕获

## Migration Plan

- 无数据库变更、无依赖新增
- 后端：新增端点 + schema，独立部署，旧端点不受影响
- 前端：types 新增字段（可选）+ 修正 `Route.plugins` 类型（仅类型标注，无运行时影响）、CentralList 初始化默认值，向后兼容
- 回滚：删除端点回滚即恢复单删行为，前端 `selectedRouteKeys` 字段无副作用

## Open Questions

- ~~批量删除确认弹窗中 Edge 节点选择：沿用单删弹窗的节点多选还是仅"全部活跃节点"开关？~~ **已定**：沿用现有 `showDeleteConfirm` 弹窗节点多选（同一集群节点，D8），零改动
- ~~DNS 路由单删是否统一禁用？~~ **已定**（P1）：批量禁选 + 单删统一禁用
- ~~勾选 ≥2 后点行行为？~~ **已定**（P2）：单选按钮随批量状态强制禁用
- ~~搜索/排序后批量勾选？~~ **已定**（P3）：翻页保留、搜索/排序清除
- ~~空 edge_uuid 守卫？~~ **已定**（P4）：跳过并记 skipped
