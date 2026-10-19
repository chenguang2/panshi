# Tasks: route-management-ux-batch1

## 1. Tab 复制脏状态修复（P1-2）

- [x] 1.1 RED：composable 单测——先编辑带插件组勾选与 WebSocket 的路由 A，再 `copyRouteByRecord(路由 B)`，断言 `routeForm.enableWebsocket`/`routeForm.plugin_config_ids` 来自 B（当前实现必红）+ 断言副本 status 沿用源路由（已裁决：不加禁用改写）+ 断言同会话 `showAddRouteModal` 后新建表单 `enableWebsocket=false`（A1：新建路径 WS 泄漏，当前必红）→ GREEN：`copyRouteByRecord` 补两行回填（写法对齐 `editRouteByRecord` :384-386；status 保持既有赋值不动）+ `showAddRouteModal` 重置清单补 `enableWebsocket` → 同文件既有用例全绿回归
- [x] 1.2 独立页复制基线对照：RouteFormModal 复制路径（:328-329）行为不变，仅加断言钉住（防未来回归）

## 2. 删除确认节点清单全量（P1-5，已裁决：共享全量拉取工具）

- [x] 2.1 RED：共享「全量拉取集群节点」工具——分页循环拉取（total > 500 时续拉后续页，断言多页请求与合并结果；MAX_PAGE_SIZE=500 封顶下语义完整）→ GREEN；单测覆盖 0/1/多页场景
- [x] 2.2 GREEN 接线：RouteList `deleteRoute`（:420-426 现裸 get 无 page_size）与 PublishConfirmModal（:140-142 现单页 500，>500 集群仍截断）都改走共享工具；Tab 侧已实测（B2）：CentralList.vue:1155 / ClusterList.vue:322 `loadNodes` 均为显式 `page_size=500` 单页——无 20 截断、有 500 上限缺口，两处一并接入共享工具（证据即本条）
- [x] 2.3 源码守卫测试：钉住「删除/发布链路拉节点必须走共享全量拉取工具」（范式同 test_publish_response.py）

## 3. 版本恢复发布出口接线（P1-6；**实施顺序：组 4 先行**——spec「恢复后呈现待发布」条文依赖 pending_publish 接线）

- [x] 3.1 RED：RouteList 组件测试——VersionManagementModal 调用点断言 `can-publish=true` + `@publish-requested` 处理器存在（当前必红）→ GREEN：补 props/事件，处理器范式照抄 UpstreamList（独立页 PublishConfirmModal → executePublish，成功后重开版本弹窗——弹窗 open watch 自动重载并复位出口条，A2 已核验）
- [x] 3.2 RED：ClusterRoutes 同款（Tab 侧接 composable 既有 `publishByRecord`）→ GREEN
- [x] 3.3 回归：`UpstreamList.test.ts` 出口条范式用例不回归；恢复语义（不自动发布）断言保持
- [x] 3.4 A2 全域补齐（已裁决 b）：既有已接线域发布成功回调补「重开版本弹窗」——UpstreamList（独立页）与统一管理/集群子页各 Tab 调用点；机械改动（visible 置回 true）→ RED：断言发布成功回调触发后版本弹窗重开 → GREEN；各域既有用例回归【实施核正：grep 实测 GlobalRuleList/PluginConfigList 等 6 处已具备重开范式（publishRefreshFn 覆盖），实际补齐仅上游域两处调用点】

## 4. 发布状态四态接线（P1-1，唯一后端改动）

- [x] 4.1 RED（后端）：route **列表**响应含 `pending_publish`（modified-after-publish 场景 true、未发布场景 absent/false 语义与 upstreams 一致）→ GREEN：`route_to_response` 照抄 `cluster_upstreams.py:95` 三参推导；两个列表端点共用该单序列化点（独立页列表 routes.py:175-177 与 Tab 列表 cluster_routes.py:132-136），组装处（pub_map 旁）传入；GET `/{route_id}` 详情端点有意不带（B1，见 design 组 4）
- [x] 4.2 **PG 方言冒烟**：`cd backend && TEST_DB_BACKEND=pg uv run pytest tests/test_pg_dialect_smoke.py -q`（写库路径改动强制项）
- [x] 4.3 RED：Tab `publish_status` 列透传 pending（PublishStatusTag `:pending`）→ GREEN；既有 publish_status 用例回归
- [x] 4.4 RED：独立页「版本」列替换为 PublishStatusTag 列（useColumnConfig key 同步）→ GREEN
- [x] 4.5 RED：`routes.py` `publish_status` 参数支持 `pending`，且三分区互斥（A3 已裁决：`published`=有版本且非 pending、`pending`=有版本且 pending、`unpublished` 不变——published 语义变化）→ GREEN；前端筛选下拉加「待发布」选项

## 5. 排序 / 报错 / 选中态（P1-3 / P1-4 / P1-7）

- [x] 5.1 RED：独立页列 `sorter: true`（可排序列收敛 name/uri/priority/created_at——status 列不渲染不暴露排序、集群/上游列移除本地 sorter，A4/A5）+ `handleTableChange` 透传 `sort_by/sort_order`（值域限 `ALLOWED_SORT_FIELDS`，ascend/descend 映射 asc/desc）→ GREEN；断言请求参数与翻页后顺序保持 + 断言集群/上游列无 sorter
- [x] 5.2 RED：RouteFormModal 保存失败透因（`getApiErrorMessage`，不再裸「保存失败」）→ GREEN
- [x] 5.3 RED：ClusterRoutes 行点击选中高亮（`customRow` 返回 `class: {'row-selected': ...}` + 样式；切换迁移/取消移除）→ GREEN；复选框路径不回归

## 6. 非 admin 筛选下拉随 UserCluster 收敛（用户裁决）

- [ ] 6.1 已核验（C5）：独立页集群下拉数据源与 `GET /clusters` 用户视角同源（clusters.py:80-81 非 admin 本就收敛）——无需代码改动，仅由 6.2 测试钉住
- [x] 6.2 RED：组件测试——非 admin 场景集群下拉选项集 == 授权集群集（mock 用户视角返回）；admin 全量不变 → GREEN

## 7. P2 体验批次

- [x] 7.1 RED：PublishConfirmModal open 默认选中全部在线节点（离线禁选不变，「全选/取消全选」保留；已裁决全域统一——共享弹窗一处实现 8 个资源域一起生效）→ GREEN；各域既有「默认全不选」断言同步反转
- [x] 7.2 RED：空态可行动——无筛选「尚未创建路由 + 新建路由」、有筛选「没有符合条件路由 + 清空筛选」（清空含重置分组，C8）→ GREEN
- [x] 7.3 RED：method chips 收敛（常驻 全部/GET/POST/PUT/DELETE/PATCH）+ 新增「方法」下拉含全部方法、与 chips 同值双向联动（C7 已裁决形态）→ GREEN；spec 现文 6 chips 与代码 8 chips 的漂移以收敛后代码为准
- [x] 7.4 RED：版本弹窗 meta 行显示「由 {created_by} 发布」（空值静默降级只显时间）→ GREEN
- [x] 7.5 RED：优先级 hint「数值越大越优先匹配」（C6 已核验：`convert_route_to_edge_format` 仅透传 priority、平台侧无反向排序，与 APISIX 大者先一致——实施期复核项关闭）；搜索 placeholder 补「域名」并确认 hosts 匹配语义后接线 → GREEN
- [x] 7.6 RED：深链 `?cluster_id=` 打开新建弹窗预选该集群 → GREEN
- [x] 7.7 RED：Tab `editRouteByRecord`/`copyRouteByRecord`/`showAddRouteModal` 移除前置 `await loadRoutes`（C4：add 路径一并移除；记录缺失兜底统一为「重载一次→再找不到才提示」）→ GREEN；既有 Tab 用例回归
- [x] 7.8 RED：`executePublish` 进度诚实化（已裁决 A 方案：去固定假步骤 10→30→70→100 与 400ms 人为延迟，过程行改「正在同步 N 个节点...」（N=选中节点数 selectedNodeIds.length，C2 钉死，非集群节点总数）+ 不确定态进度，完成时一次性出结果；终态渲染不动）→ GREEN；既有发布进度用例回归（SSE 逐节点发布流另立项，不在本批）
- [x] 7.9 RED：独立页 DNS 行 ⋯ 禁用 + tooltip「DNS 路由请在『DNS 代理』页管理」（删 toast 拦截）→ GREEN；Tab 对齐（A6）：行内按钮与工具栏对 DNS 行/选中 DNS 项禁用（tooltip 指路），删除 toast 守卫保留兜底 → 双入口一致断言
- [x] 7.10 筛选区允许换行（nowrap 清除）+ 计数/刷新右置同组（纯样式，组件测试不强制）

## 8. 回归与实页验收

- [x] 8.1 前端：`npx vitest run <本变更触碰文件> --no-file-parallelism` 全绿 → `npx vue-tsc -b` 类型验证（规则 #27）→ 全量串行复核（规则 #208）
- [x] 8.2 后端：`uv run pytest -k "route" -q` 全绿（规则 #51：语义改动必须回归同域既有测试；A3 published 互斥语义变化在此覆盖）；全量按需
- [x] 8.3 实页验收（规则 #51，截图落用户实际操作页面）：独立页 /routes 一轮（发布状态列/待发布筛选/服务端排序/空态/深链预选/DNS 禁用/删除节点全量确认/保存失败透因）+ 统一管理 Tab 路由页一轮（行选中高亮/复制无脏状态/恢复→立即发布闭环/发布进度 x/N）+ 双入口一致性对照（2026-10-19 Playwright 实测 test 集群 19 项全过；验收中发现并修复 #empty→#emptyText 空态槽名缺陷，见 RouteList/NodeList/UpstreamList/UserList）
- [x] 8.4 发布/删除流程在测试集群哑节点上走通，验收后清理测试数据（test 集群真实节点 3 在线+1 离线：发布走 1 在线节点、删除经全量节点确认单，accept-tmp 临时路由已清理，库/平台归零；离线节点 0.24 的 Edge 残留无害）
