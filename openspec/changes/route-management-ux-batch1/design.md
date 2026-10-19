# Design: route-management-ux-batch1

## Context

评审报告与逐条核验证据见会话记录；核心文件：`RouteList.vue`（独立页）、`ClusterRoutes.vue`（Tab）、`useClusterRoutes.ts`（共享 CRUD）、`RouteFormModal.vue`（独立页表单）、`PublishConfirmModal.vue`（发布确认）、`VersionManagementModal.vue`（版本弹窗，出口条已内建）、`useClusterUtils.ts`（发布/删除共享弹窗）、后端 `cluster_routes.py` / `routes.py` / `cluster_nodes.py`。

硬约定：发布/删除统一走 `useClusterUtils` 共享实现（#7/#18）；文案中文内联（#9）；时间格式化只用 `utils/format.ts`（#26）；a-table 内置分页（#54）；弹窗三层制（#25）；双入口行为一致是硬要求。

## 组 1：Tab 复制脏状态修复（P1-2）

- 根因：`copyRouteByRecord`（useClusterRoutes.ts:406-437）逐字段回填缺 `enableWebsocket` 与 `plugin_config_ids`；`routeForm` 是 composable 级 reactive 单例（:176-191），前次编辑会话的状态残留进复制表单。
- 修法：补两行回填，写法对齐 `editRouteByRecord`（:384-386）：
  - `routeForm.enableWebsocket = !!sourceRoute.enable_websocket`
  - `routeForm.plugin_config_ids = sourceRoute.plugin_config_ids ? [...sourceRoute.plugin_config_ids] : []`
- **评审补审（A1，用户已确认）**：脏状态不止复制路径——`showAddRouteModal` 的重置清单（useClusterRoutes.ts:333-345）不含 `enableWebsocket`，先编辑开 WS 的路由再点「添加路由」，新建表单 WS 残留为 true，提交即写库。修复同处补一行重置，与复制路径同组同测。
- **已裁决：复制 status 沿用源路由**（源启用则副本启用）——与独立页现行为一致；未发布前不生效，风险由发布确认环节把关，不加额外步骤。
- 测试：useClusterNodes 同款 composable 单测范式，断言「先编辑带插件组/WS 的路由 A，再复制路由 B，表单两字段来自 B 而非 A」+ 断言「同会话点『添加路由』，新建表单 `enableWebsocket=false`」。
- 风险：无。独立页复制（RouteFormModal.vue:328-329）已是正确基线，不动。

## 组 2：删除确认节点清单全量（P1-5）

- 根因：`deleteRoute`（RouteList.vue:420-426）`api.get(/clusters/{id}/nodes)` 未传 page_size，后端默认 20（cluster_nodes.py:175）。
- **已裁决：共享全量拉取工具**——MAX_PAGE_SIZE=500 封顶意味着单页 `page_size=500` 对 >500 节点集群仍截断（PublishConfirmModal 现有修法 :140-142 同样存在此缺口）。新增共享「全量拉取集群节点」工具（分页循环拉取，total>500 时续拉，通常 1-3 请求），删除确认链路（RouteList `deleteRoute`、`useClusterResourceCore.proceedDelete` 上游装载）与发布确认（PublishConfirmModal）共用，一并消除 500 截断缺口。
- Tab 侧已实测（评审补审 B2）：`useClusterResourceCore.proceedDelete` 使用 `cluster.nodes`（:90），装载点 CentralList.vue:1155 / ClusterList.vue:322 均显式 `page_size: PAGE_SIZE_DROPDOWN`（500）——**无 20 截断**，但 500 单页缺口与 PublishConfirmModal 同款；两处 `loadNodes` 一并接入共享全量工具（tasks 2.2）。
- 分页循环中途失败语义（评审补审 C1）：任一页拉取失败 SHALL 整体报错（错误态 + 重新加载，复用 PublishConfirmModal 既有 error 分支），SHALL NOT 以部分节点清单静默继续。
- 守卫：源码守卫测试钉住「删除/发布链路拉节点必须走全量拉取工具」（防回归，范式同 test_publish_response.py 源码守卫）。

## 组 3：版本恢复发布出口接线（P1-6）

- 组件能力已存在：`VersionManagementModal` L11-14 出口条（`canPublish && restoredVersion`）、L207-210 `emit('publish-requested')`。
- 修法：RouteList 与 ClusterRoutes 的调用点补 `:can-publish="true"` + `@publish-requested="onVmPublishRequested"`；处理器范式照抄 UpstreamList（:117/:126/:129）——独立页走 `PublishConfirmModal → executePublish`，Tab 走 composable 既有 `publishByRecord`。
- **评审补审（A2，已裁决 b：全域补齐）**：design 初稿「发布成功后重开版本弹窗，与既有接线一致」不实——UpstreamList `onPublishConfirm`（:358-368）发布成功后只刷新列表、**不重开**版本弹窗，既有 5 个已接线域均无此行为。而 config-version-management 条文要求所有已接线入口发布成功后重开（重载版本列表并复位出口条）。裁决：本变更把既有已接线域一并补齐——发布成功回调将弹窗 visible 置回 true 即可，弹窗 open watch（VersionManagementModal:267-279）自动重载版本并复位出口条（纯调用点改动，组件不动）；tasks 3.4 落实。【实施核正（组 3 实测）：GlobalRuleList/PluginConfigList/PluginMetadataList/ClusterGlobalRules/ClusterPluginConfigs 等已接线调用点本就具备 publishRefreshFn 覆盖重开范式，实际需补齐的仅上游域两处调用点（UpstreamList 独立页、ClusterUpstreams Tab）——终态与本裁决一致】
- 语义不变：恢复本身仍不自动发布（config-version-management 既有要求），出口条只是把「用户自己找回发布入口」的那段路补上。
- **实施顺序依赖**：config-version-management 的「已接线调用点恢复后 SHALL 呈现待发布」条文依赖组 4 的 `pending_publish` 接线——出口条本身不依赖该字段，但路由域要完整满足 spec 条文须组 4 先行（tasks 已按此排序注记）。

## 组 4：发布状态四态接线（P1-1）

- 后端（唯一后端改动）：`cluster_routes.py::route_to_response` 补 `pending_publish`，推导照抄 `cluster_upstreams.py:95` 的 `edge_sync.derive_pending_publish`（updated_at vs published_at 比较；Route 模型已有 `updated_at`，models/cluster.py:99-100）；列表响应组装处（:133 附近 pub_map 旁）同步传入。**序列化为单点**（评审补审 B1 修正表述）：复用点为**两个列表端点**——Tab 列表（cluster_routes.py:132-136）与独立页列表（routes.py:175-177）均经 `route_to_response`，一处补字段两入口列表同时生效；GET `/{route_id}` 详情端点（cluster_routes.py:183-209）系手工构造，**有意不带**发布字段（发布状态展示只走列表，两入口编辑表单均以列表 record 回填，不依赖详情字段）；`status` 启停等本地修改同样推进 `updated_at` → pending 为 true（与 upstreams 既有语义一致，不单独豁免）。
- **PG 方言冒烟**：本组触及写库路径序列化，合入前必须 `TEST_DB_BACKEND=pg uv run pytest tests/test_pg_dialect_smoke.py -q`（仓库规则 #31）。
- **publish_status 筛选互斥三分区（A3，已裁决）**：现「已发布」= 存在任意 ConfigVersion（routes.py:82-91），加 pending 后与「待发布」重叠。裁决为互斥分区：`published` = 有 current_version 且非 pending；`pending` = 有 current_version 且 pending；`unpublished` 不变。既有 published 行为改变，回归面仅独立页筛选（Tab 无此筛选参数）。
- 前端：Tab `publish_status` 列渲染透传 pending（PublishStatusTag 传 `:pending`）；独立页「版本」列（RouteList.vue:124-126）替换为 `PublishStatusTag`（列 key `publish_status`，useColumnConfig key 空间同步）；`routes.py` `publish_status` 参数扩展 `pending` 取值（基于 pending_publish 过滤）。
- 时间列语义：`published_at` 保持 isoformat 无时区后缀（naive UTC 约定 #26），前端展示走 `utils/format.ts`。

## 组 5：排序 / 报错 / 选中态（P1-3 / P1-4 / P1-7）

- 服务端排序：独立页列定义 `sorter: (a,b)=>...` 改 `sorter: true`；`handleTableChange` 签名扩展接收 sorter，透传 `sort_by`（映射 `ALLOWED_SORT_FIELDS`：name/uri/priority/status/created_at，routes.py:18）与 `sort_order`（ascend→asc / descend→desc）；默认排序维持后端现状。Tab 已走服务端排序（useClusterResourceCore sortFieldMap），对齐即可。
- **评审补审（A4/A5）**：可排序列收敛——status 列已不渲染（无表头可点），前端不暴露其排序（后端 `ALLOWED_SORT_FIELDS` 不动）；「集群/上游」两列现存本地 sorter（RouteList.vue:267-273）只重排当前页，属同款排序假象，一并移除（后端加 join 排序 ROI 低）；spec 列清单补「上游」列。
- 保存失败透因：RouteFormModal.vue:441-442 `catch { message.error('保存失败') }` 改 `message.error(getApiErrorMessage(error))`（`@/utils/error` 已在 useClusterRoutes.ts:499 同范式使用）。
- 行选中高亮：ClusterRoutes `customRow` 返回值增加 `class: { 'row-selected': cluster.selectedRoute?.id === record.id }` + 一行高亮样式（accent 底色，与 a-table 原生选中色一致）；不动复选框路径。

## 组 6：筛选下拉随 UserCluster 收敛（用户裁决）

- 语义：非 admin 用户在独立页的「集群」筛选下拉 SHALL 只见其授权集群（数据源与 `routes.py:62-69` 列表过滤同源，即 `GET /clusters` 的用户视角返回）；admin 全量不变。上游筛选下拉选项随所选集群的既有接口返回，天然受集群可见性约束——集群收敛后自动收敛，无需额外接口。
- 实现（评审补审 C5：已核验，无需代码改动）：`GET /clusters` 对非 admin 本就按 UserCluster 收敛（clusters.py:80-81），RouteList.loadClusters 走的就是该端点——下拉数据源天然同源，仅补钉住测试（6.2）。存量限制注记：/clusters 默认 page_size=200，>200 集群下拉截断，本批不动。
- 守卫：组件测试断言非 admin 场景下拉选项集 == 授权集群集（mock 用户视角返回）。

## 组 7：P2 批次

| 项 | 决策 |
|---|---|
| 发布确认默认全选 | open 时 `selectedNodeIds = 在线节点全集`（status==1）；离线仍禁用+不选；「全选/取消全选」保留；publish-node-select spec 的「默认全不选」条文随本变更 MODIFIED。**已裁决：全域统一**——共享弹窗一处实现，8 个资源域一起生效，各域既有「默认全不选」断言随 7.1 一起反转 |
| 空态可行动 | 区分「从未创建」（+新建路由按钮）与「筛选无结果」（+清空筛选按钮）；清空=重置 search/分组/集群/状态/插件/method（评审补审 C8：独立页存在分组下拉且联动集群，一并重置） |
| method chips 收敛 | 常驻保留 全部/GET/POST/PUT/DELETE/PATCH；其余（OPTIONS/CONNECT/TRACE 等）收进方法下拉；独立页当前无方法下拉控件（评审补审 C7，已裁决形态）：新增含全部方法的「方法」下拉，与 chips 同一选中值双向联动（chips 为高频快捷方式）；spec 现文写 6 个 chips 与代码 8 个有漂移，以收敛后的代码为准修正 spec |
| 版本操作人 | meta 行补「由 {created_by} 发布」；接口字段已存在（VersionManagementModal.vue:139 interface 有、:53-55 未渲染） |
| 优先级 hint | label 下 hint「数值越大越优先匹配」（**用户已确认语义：大者先**）；评审补审（C6）已核验：`convert_route_to_edge_format` 仅透传 priority（edge_client.py:540-541），平台侧无反向排序，APISIX 语义大者先——hint 与下发行为一致，实施期复核项关闭 |
| 搜索字段补域名 | 前端 placeholder 改「搜索名称 / URI / 描述 / 域名」；后端 `ALLOWED_SEARCH_FIELDS` 已含 hosts，仅需确认 hosts 匹配语义（精确/包含）后接线 |
| 深链预选 | RouteList 打开新建弹窗时以当前 `clusterFilter` 作为默认集群（`?cluster_id=` 已进列表过滤器，RouteList.vue:462-468） |
| Tab 开表单不重载 | `editRouteByRecord`/`copyRouteByRecord`/`showAddRouteModal` 直接按 record/初始态填充，移除前置 `await loadRoutes`（useClusterRoutes.ts:327-328,360-362,407-408；评审补审 C4：add 路径 :328 一并移除）；「列表找不到记录」兜底统一为重载一次→再找不到才提示（现状 copy 拿旧 record 兜底、edit 警告退出，两入口不一致） |
| 发布进度真化 | **已裁决：A 诚实文案**——现发布是单请求 API（后端内部遍历节点，前端拿不到逐节点完成事件），真百分比做不到；本批去掉固定假步骤（10→30→70→100）与 400ms 人为延迟，过程行改「正在同步 N 个节点...」（N=**选中节点数** selectedNodeIds.length，评审补审 C2 钉死，非集群节点总数）+ 不确定态进度（完成时一次性出结果），终态渲染不动；SSE 逐节点发布流另立项（out of scope） |
| DNS 行禁用 | 独立页 DNS 路由行 ⋯ 按钮禁用 + tooltip「DNS 路由请在『DNS 代理』页管理」；删除 alertDnsRoute toast 拦截。评审补审（A6）：Tab 现状仅复选框禁用（ClusterRoutes.vue:67 getCheckboxProps），行点击选中 DNS 行后工具栏「编辑路由/复制路由/发布/版本管理」与行内按钮全部可用，可绕过 DNS 代理页直接编辑/复制/发布——Tab 行内按钮与工具栏对 DNS 行（行本身或选中项为 DNS）同步禁用（tooltip 指路），删除 toast 守卫保留兜底 |
| 筛选区换行 | `flex-wrap: nowrap` → 允许换行（RouteList.vue:476-482）；计数与刷新右置同组 |

## 回归与验收原则

- 每组 TDD（RED→GREEN，仓库规则 #16）；语义改动必须回归同域既有测试（规则 #51：`pytest -k route` / 前端 `vitest run <相关文件> --no-file-parallelism`，全量收口用串行跑法，规则 #208）；类型验证用 `npx vue-tsc -b`（规则 #27，tasks 8.1 已纳入）。
- 实页验收必须落在用户实际操作的页面截图确认（规则 #51）：独立页 /routes 与 统一管理 Tab 路由页各一轮；发布/删除流程在哑节点/测试集群上执行。
- 双入口一致性为验收项之一：任一行为改动，两入口都要过一遍。
