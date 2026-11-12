# Design

## Context

见 `proposal.md` — Why。当前事实（已核实的现状，不是推测）：

- 后端 `app/api/v1/cluster_routes.py` 列表端点已按 `edge_sync.load_publish_time_map` + `edge_sync.derive_pending_publish` 回填 `pending_publish`，`Route.updated_at` 带 `onupdate`，编辑保存后必然置为「待发布」。**本变更不碰后端。**
- 前端两处保存入口均已接 `PublishStatusTag :pending`，因此「待发布」标签本身工作正常（实测路由管理页 20 行中 17 行渲染待发布）。缺的是保存瞬间的语义反馈。
- 上游域已有完整范式可对齐：`components/UpstreamFormModal.vue`（toast + `showOverlayModal` + `emit('publish-requested')`）与 `composables/useClusterUpstreams.ts`（toast + `showOverlayModal` + `core.publishByRecord`）。
- 路由域机制已就绪：独立页有 `PublishConfirmModal` + `onPublish`（`views/RouteList.vue`），集群 Tab 有 `useClusterResourceCore.publishByRecord` + 注入的 `openPublishModal`。

## Goals / Non-Goals

- Goals：两个保存入口的「保存 ≠ 生效」语义一致；引导出口复用既有发布链路零新增实现；DNS 查询路由不出现可触发错误发布的出口。
- Non-Goals：不统一其余资源域（四层代理 / DNS 代理 / SSL / 静态资源 / 插件组）的同类缺口；不改 `pending_publish` 推导与列表端点；不改 `PublishConfirmModal` / `executePublish` / 版本管理；不给「保存即自动发布」选项。

## Decisions

### D1 引导形态：`useOverlayModal` 轻确认（沿用上游）
- 选：`showOverlayModal({ title, content, okText: '立即发布', cancelText: '稍后', onOk })`。
- 弃：`Modal.confirm`（全站已清零，见约定 #25）；弃 toast-only（插件组现状，无法把下一步动作递到手上）。
- 理由：同一语义在上游域已是既有范式，复制范式＝一致性成本最低；弹窗挂在 body（z-index 2000），与表单不存在遮罩叠加问题。

### D2 发布走既有链路，不新造
- 独立页：表单 `emit('publish-requested', { clusterId, routeId, name, currentVersion, isDnsRoute })` → `RouteList` 设置 `publishingRecord` / `publishClusterId` / `publishRefreshFn = loadRoutes` → 打开既有 `PublishConfirmModal`（复用 `onPublish` → `executePublish`）。
- 集群 Tab：`useClusterRoutes` 保存后从刷新的 `c.routes` 里取回保存记录 → `core.publishByRecord(cluster, record)`（内部即 `openPublishModal` + `publishToNodes` → `executePublish`）。
- 弃：在组件内直接调发布 API（会绕开节点选择、进度弹窗、失败汇总，破坏约定 #18/#24）。

### D3 文案沿用上游字面量，不抽共享常量
- 选：`已保存。配置尚未发布，需发布后才会在 Edge 节点生效`（toast）与 `配置尚未发布，发布后才会推送到 Edge 节点生效。`（弹窗正文）逐字复制上游域。
- 理由：一行字符串、跨域仅两处引用；上游域现有实现也是字面量。抽常量需要新建共享模块并改动上游两处（超出本变更范围），留待第二批全站推广时一并抽取。
- 权衡：文案漂移风险由守卫测试兜底（用例断言字面量）。

### D4 DNS 路由例外在「保存时」判定，不看列表 `pending` 字段
- 判定源：表单内 `form.plugins`（独立页）/ 保存后记录 `record.plugins`（集群 Tab），任一 `plugin_name === 'dns_upstream'` 即为 DNS 路由。
- 行为：引导弹窗改文案为「DNS 路由请在『DNS 代理』页管理」，且**不传 `onOk` 发布动作**（`showOverlayModal` 仅保留确认关闭），不打开 `PublishConfirmModal`。
- 理由：列表侧行内发布对 DNS 路由是禁用的（`DNS_ROUTE_HINT`），若引导给了「立即发布」就会绕过该禁用语义；保存瞬间插件集合已确定，无需再查库。

### D5 关闭表单与弹引导的顺序
- 先 `emit('saved')` + `emit('close')`（父页刷新列表 + 关表单），再 `showOverlayModal`；`emit('saved')` 保证「稍后」路径下列表已显示「待发布」。
- 理由：与上游实现一致；避免弹窗与表单同屏。

### D6 独立页的改造边界
- `RouteFormModal.vue`：`defineEmits` 增加 `publish-requested`；三处 `message.success` 合并为统一文案；提交尾部（含 plugins PUT 之后）追加引导。
- `RouteList.vue`：新增 `onFormPublishRequested(payload)`，设置 `publishingRecord`（含 `current_version`，用于发布弹窗「将创建新版本 v(N+1)」说明）并打开既有 `PublishConfirmModal`。
- `useClusterRoutes.ts`：`handleRouteSubmit` 保存分支统一文案；关闭弹窗、刷新集群路由后调用 `showPublishGuide(cluster, savedRecord)`（内部 `showOverlayModal` + `core.publishByRecord`，DNS 路由走 D4 分支）。

## Risks / Trade-offs

- [每次保存都弹窗可能打扰] → 用户选「稍后」后仍有「待发布」标签与行内「发布」；与上游域已接受的行为一致。
- [集群 Tab 的发布依赖父级注入 `openPublishModal`] → `ClusterRoutes.vue` 已声明该 prop（`CentralList.vue` 注入），仅在测试挂载时需提供桩；用例覆盖「未注入时不报错/不发布」的路径判断。
- [D4 的 DNS 判定与列表判定可能漂移] → 两处都以 `plugin_name === 'dns_upstream'` 单一判据；`RouteList` 已有 `hasDnsPlugin()`，复用同一判据形态。
- [jsdom 下 `showOverlayModal` 直写 DOM] → 用例按 `useClusterUpstreams.test.ts` / `UpstreamFormModal.test.ts` 既有范式 mock `@/composables/useOverlayModal` 并断言参数（含 `onOk` 存在性）。
- [文案改动影响既有断言] → 已 `grep` 确认无测试断言「路由已更新/已添加」；新增用例断言新文案。

## Migration Plan

- 纯前端发布，无接口、无数据库、无配置变更；回滚＝还原 `RouteFormModal.vue` / `RouteList.vue` / `useClusterRoutes.ts` 三个文件。
- 验证：前端单测（新增/更新用例）→ `npx vue-tsc -b` → 真实页面手动验收（独立页编辑保存看 toast + 引导；集群 Tab 编辑保存看同款；DNS 路由保存看例外文案）。

## Open Questions

（无）
