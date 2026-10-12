# Proposal: route-management-ux-batch1

## Why

路由管理模块 UX 评审（含逐条代码核验）结论：**7 项 P1 + 11 项 P2**。其中 1 项是功能正确性缺陷（Tab 复制路由携带前次表单会话的插件组/WebSocket 脏状态，提交即写库）；多项高风险盲区（删除确认节点清单被默认 page_size=20 静默截断、版本恢复后无发布出口导致回滚闭环断裂、独立页看不到「改了没发」）；另有多处双入口行为分裂（排序假象、保存失败吞因、行选中无反馈、DNS 拦截形态不一）与用户已裁决的两项语义（优先级方向=大者先；非 admin 角色筛选下拉须随 UserCluster 收敛）。

## What Changes

按修复优先级顺序，七个组：

1. **Tab 复制脏状态修复**（P1-2）：`copyRouteByRecord` 补 `enableWebsocket`/`plugin_config_ids` 回填，字段全集对齐 `editRouteByRecord`（RouteFormModal 独立页复制已是正确基线）
2. **删除确认节点清单全量**（P1-5，已裁决共享全量拉取）：新增共享「全量拉取集群节点」工具（分页循环，突破单页 500 截断），删除确认链路与发布确认（PublishConfirmModal 既有 500 单页缺口）共用；核查 Tab/CentralList 装载 `cluster.nodes` 路径是否同样截断
3. **版本恢复发布出口接线**（P1-6）：路由两入口（RouteList / ClusterRoutes）给 `VersionManagementModal` 传 `:can-publish="true"` 并接 `@publish-requested` 到各自既有发布链路（8 个既有调用点同范式）
4. **发布状态四态接线**（P1-1，唯一后端改动）：后端 `route_to_response` 补 `pending_publish`（照抄 `cluster_upstreams.py:95` 的 `edge_sync.derive_pending_publish` 三参推导）；Tab `publish_status` 列透传 pending；独立页以 `PublishStatusTag` 取代裸版本列；`publish_status` 筛选增加「待发布」
5. **排序 / 报错 / 选中态**（P1-3/P1-4/P1-7）：独立页列定义改服务端排序（`sorter: true` + 透传 `sort_by/sort_order`，后端 `ALLOWED_SORT_FIELDS` 已支持）；保存失败经 `getApiErrorMessage` 透出后端原因；Tab 行点击选中补高亮样式（`row-selected` class 与工具栏启用态同时成立）
6. **筛选下拉随 UserCluster 收敛**（用户裁决）：独立页集群/上游筛选下拉的可见选项随当前用户授权集群收敛（admin 全量不变）；对齐 `routes.py:62-69` 列表端点已有的过滤语义
7. **P2 体验批次**：发布确认默认全选在线节点（已裁决全域统一，8 资源域一起生效）；空态可行动（区分未创建/无匹配）；method chips 收敛高频 5 个；版本弹窗展示操作人 `created_by`；优先级 hint「数值越大越优先匹配」（用户确认语义）+ 搜索字段补域名；深链 `?cluster_id=` 预选新建弹窗集群；Tab 打开表单不再强制 `await loadRoutes`；发布进度诚实化（去固定假百分比与人为延迟，过程行「正在同步 N 个节点...」）；DNS 路由行禁用 ⋯ + tooltip 指路（替代 toast 拦截）；筛选区允许换行

## Impact

- **Specs**: `cluster-routes-composable`（MODIFIED 复制回填完整性含 status 沿用/开表单不重载）、`shared-publish-flow`（ADDED 进度诚实反馈/确认弹窗节点清单全量拉取）、`config-version-management`（MODIFIED 接线清单加路由两入口 + ADDED 操作人展示）、`publish-badges`（MODIFIED 四态发布状态）、`route-management`（MODIFIED 独立页需求块）、`cluster-routes-component`（MODIFIED 行选中反馈）、`publish-node-select`（MODIFIED 默认选中在线节点）
- **Code**: 前端 `useClusterRoutes.ts`、`RouteList.vue`、`ClusterRoutes.vue`、`RouteFormModal.vue`、`PublishConfirmModal.vue`、`useClusterUtils.ts`、`VersionManagementModal.vue`（仅接线调用点，组件出口条已存在）；后端仅 `cluster_routes.py`（`route_to_response` 补一个推导字段）
- **风险**：第 4 组触及写库路径（`route_to_response` 序列化），按仓库规则合入前必须跑 PG 方言冒烟（`tests/test_pg_dialect_smoke.py`）
- **Out of scope**: SSE 逐节点发布流（真逐节点进度需流式端点，另立项）、路由批量操作上提独立页（保留 Tab 专属，独立页仅页头文案指路）、两入口列模型合并、partial 态失败节点单节点重试、PublishStatusTag 组件本身改造（四态能力已存在，仅接线）
