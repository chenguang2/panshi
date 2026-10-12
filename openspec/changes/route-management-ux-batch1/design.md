# Design: route-management-ux-batch1

## Context

评审报告与逐条核验证据见会话记录；核心文件：`RouteList.vue`（独立页）、`ClusterRoutes.vue`（Tab）、`useClusterRoutes.ts`（共享 CRUD）、`RouteFormModal.vue`（独立页表单）、`PublishConfirmModal.vue`（发布确认）、`VersionManagementModal.vue`（版本弹窗，出口条已内建）、`useClusterUtils.ts`（发布/删除共享弹窗）、后端 `cluster_routes.py` / `routes.py` / `cluster_nodes.py`。

硬约定：发布/删除统一走 `useClusterUtils` 共享实现（#7/#18）；文案中文内联（#9）；时间格式化只用 `utils/format.ts`（#26）；a-table 内置分页（#54）；弹窗三层制（#25）；双入口行为一致是硬要求。

## 组 1：Tab 复制脏状态修复（P1-2）

- 根因：`copyRouteByRecord`（useClusterRoutes.ts:406-437）逐字段回填缺 `enableWebsocket` 与 `plugin_config_ids`；`routeForm` 是 composable 级 reactive 单例（:176-191），前次编辑会话的状态残留进复制表单。
- 修法：补两行回填，写法对齐 `editRouteByRecord`（:384-386）：
  - `routeForm.enableWebsocket = !!sourceRoute.enable_websocket`
  - `routeForm.plugin_config_ids = sourceRoute.plugin_config_ids ? [...sourceRoute.plugin_config_ids] : []`
- **已裁决：复制 status 沿用源路由**（源启用则副本启用）——与独立页现行为一致；未发布前不生效，风险由发布确认环节把关，不加额外步骤。
- 测试：useClusterNodes 同款 composable 单测范式，断言「先编辑带插件组/WS 的路由 A，再复制路由 B，表单两字段来自 B 而非 A」。
- 风险：无。独立页复制（RouteFormModal.vue:328-329）已是正确基线，不动。

## 组 2：删除确认节点清单全量（P1-5）

- 根因：`deleteRoute`（RouteList.vue:420-426）`api.get(/clusters/{id}/nodes)` 未传 page_size，后端默认 20（cluster_nodes.py:175）。
- **已裁决：共享全量拉取工具**——MAX_PAGE_SIZE=500 封顶意味着单页 `page_size=500` 对 >500 节点集群仍截断（PublishConfirmModal 现有修法 :140-142 同样存在此缺口）。新增共享「全量拉取集群节点」工具（分页循环拉取，total>500 时续拉，通常 1-3 请求），删除确认链路（RouteList `deleteRoute`、`useClusterResourceCore.proceedDelete` 上游装载）与发布确认（PublishConfirmModal）共用，一并消除 500 截断缺口。
- Tab 侧核查：`useClusterResourceCore.proceedDelete` 使用 `cluster.nodes`（:90），其装载点在 CentralList/集群详情 `loadNodes`——实施时先实测其 page_size；若同样默认 20 截断，同款修复并在 tasks 勾选项中记录。
- 守卫：源码守卫测试钉住「删除/发布链路拉节点必须走全量拉取工具」（防回归，范式同 test_publish_response.py 源码守卫）。

## 组 3：版本恢复发布出口接线（P1-6）

- 组件能力已存在：`VersionManagementModal` L11-14 出口条（`canPublish && restoredVersion`）、L207-210 `emit('publish-requested')`。
- 修法：RouteList 与 ClusterRoutes 的调用点补 `:can-publish="true"` + `@publish-requested="onVmPublishRequested"`；处理器范式照抄 UpstreamList（:117/:126/:129）——独立页走 `PublishConfirmModal → executePublish`，Tab 走 composable 既有 `publishByRecord`；发布成功后重开版本弹窗（重载版本列表并复位出口条，与既有接线一致）。
- 语义不变：恢复本身仍不自动发布（config-version-management 既有要求），出口条只是把「用户自己找回发布入口」的那段路补上。
- **实施顺序依赖**：config-version-management 的「已接线调用点恢复后 SHALL 呈现待发布」条文依赖组 4 的 `pending_publish` 接线——出口条本身不依赖该字段，但路由域要完整满足 spec 条文须组 4 先行（tasks 已按此排序注记）。

## 组 4：发布状态四态接线（P1-1）

- 后端（唯一后端改动）：`cluster_routes.py::route_to_response` 补 `pending_publish`，推导照抄 `cluster_upstreams.py:95` 的 `edge_sync.derive_pending_publish`（updated_at vs published_at 比较；Route 模型已有 `updated_at`，models/cluster.py:99-100）；列表响应组装处（:133 附近 pub_map 旁）同步传入。**序列化为单点**：已核验独立页列表（routes.py:175-177）与 Tab 详情（cluster_routes.py:205）均复用 `route_to_response`，一处补字段两入口同时生效；`status` 启停等本地修改同样推进 `updated_at` → pending 为 true（与 upstreams 既有语义一致，不单独豁免）。
- **PG 方言冒烟**：本组触及写库路径序列化，合入前必须 `TEST_DB_BACKEND=pg uv run pytest tests/test_pg_dialect_smoke.py -q`（仓库规则 #31）。
- 前端：Tab `publish_status` 列渲染透传 pending（PublishStatusTag 传 `:pending`）；独立页「版本」列（RouteList.vue:124-126）替换为 `PublishStatusTag`（列 key `publish_status`，useColumnConfig key 空间同步）；`routes.py` `publish_status` 参数扩展 `pending` 取值（基于 pending_publish 过滤）。
- 时间列语义：`published_at` 保持 isoformat 无时区后缀（naive UTC 约定 #26），前端展示走 `utils/format.ts`。

## 组 5：排序 / 报错 / 选中态（P1-3 / P1-4 / P1-7）

- 服务端排序：独立页列定义 `sorter: (a,b)=>...` 改 `sorter: true`；`handleTableChange` 签名扩展接收 sorter，透传 `sort_by`（映射 `ALLOWED_SORT_FIELDS`：name/uri/priority/status/created_at，routes.py:18）与 `sort_order`（ascend→asc / descend→desc）；默认排序维持后端现状。Tab 已走服务端排序（useClusterResourceCore sortFieldMap），对齐即可。
- 保存失败透因：RouteFormModal.vue:441-442 `catch { message.error('保存失败') }` 改 `message.error(getApiErrorMessage(error))`（`@/utils/error` 已在 useClusterRoutes.ts:499 同范式使用）。
- 行选中高亮：ClusterRoutes `customRow` 返回值增加 `class: { 'row-selected': cluster.selectedRoute?.id === record.id }` + 一行高亮样式（accent 底色，与 a-table 原生选中色一致）；不动复选框路径。

## 组 6：筛选下拉随 UserCluster 收敛（用户裁决）

- 语义：非 admin 用户在独立页的「集群」筛选下拉 SHALL 只见其授权集群（数据源与 `routes.py:62-69` 列表过滤同源，即 `GET /clusters` 的用户视角返回）；admin 全量不变。上游筛选下拉选项随所选集群的既有接口返回，天然受集群可见性约束——集群收敛后自动收敛，无需额外接口。
- 实现：确认独立页拉集群列表的端点与 CentralList 同源（若现走全量端点则切换到用户视角端点）；不新增后端接口。
- 守卫：组件测试断言非 admin 场景下拉选项集 == 授权集群集（mock 用户视角返回）。

## 组 7：P2 批次

| 项 | 决策 |
|---|---|
| 发布确认默认全选 | open 时 `selectedNodeIds = 在线节点全集`（status==1）；离线仍禁用+不选；「全选/取消全选」保留；publish-node-select spec 的「默认全不选」条文随本变更 MODIFIED。**已裁决：全域统一**——共享弹窗一处实现，8 个资源域一起生效，各域既有「默认全不选」断言随 7.1 一起反转 |
| 空态可行动 | 区分「从未创建」（+新建路由按钮）与「筛选无结果」（+清空筛选按钮）；清空=重置 search/集群/状态/插件/method |
| method chips 收敛 | 常驻保留 全部/GET/POST/PUT/DELETE/PATCH；其余（OPTIONS/CONNECT/TRACE 等）收进方法下拉；spec 现文写 6 个 chips 与代码 8 个有漂移，以收敛后的代码为准修正 spec |
| 版本操作人 | meta 行补「由 {created_by} 发布」；接口字段已存在（VersionManagementModal.vue:139 interface 有、:53-55 未渲染） |
| 优先级 hint | label 下 hint「数值越大越优先匹配」（**用户已确认语义：大者先**）；与 Edge 下发逻辑 `convert_route_to_edge_format` 的既有排序语义一致性在实施时以代码复核一次，若发现实际相反先停下报告 |
| 搜索字段补域名 | 前端 placeholder 改「搜索名称 / URI / 描述 / 域名」；后端 `ALLOWED_SEARCH_FIELDS` 已含 hosts，仅需确认 hosts 匹配语义（精确/包含）后接线 |
| 深链预选 | RouteList 打开新建弹窗时以当前 `clusterFilter` 作为默认集群（`?cluster_id=` 已进列表过滤器，RouteList.vue:462-468） |
| Tab 开表单不重载 | `editRouteByRecord`/`copyRouteByRecord` 直接按 record 填充，移除前置 `await loadRoutes`（useClusterRoutes.ts:327-328,360-362,407-408）；仅在列表中找不到该记录时兜底重载 |
| 发布进度真化 | **已裁决：A 诚实文案**——现发布是单请求 API（后端内部遍历节点，前端拿不到逐节点完成事件），真百分比做不到；本批去掉固定假步骤（10→30→70→100）与 400ms 人为延迟，过程行改「正在同步 N 个节点...」+ 不确定态进度（完成时一次性出结果），终态渲染不动；SSE 逐节点发布流另立项（out of scope） |
| DNS 行禁用 | 独立页 DNS 路由行 ⋯ 按钮禁用 + tooltip「DNS 路由请在『DNS 代理』页管理」（对齐 Tab ClusterRoutes.vue:67 禁用语义）；删除 alertDnsRoute toast 拦截 |
| 筛选区换行 | `flex-wrap: nowrap` → 允许换行（RouteList.vue:476-482）；计数与刷新右置同组 |

## 回归与验收原则

- 每组 TDD（RED→GREEN，仓库规则 #16）；语义改动必须回归同域既有测试（规则 #51：`pytest -k route` / 前端 `vitest run <相关文件> --no-file-parallelism`，全量收口用串行跑法，规则 #208）。
- 实页验收必须落在用户实际操作的页面截图确认（规则 #51）：独立页 /routes 与 统一管理 Tab 路由页各一轮；发布/删除流程在哑节点/测试集群上执行。
- 双入口一致性为验收项之一：任一行为改动，两入口都要过一遍。
