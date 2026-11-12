# Tasks

## 1. 独立页（路由管理）：保存语义与发布引导

- [x] 1.1 RED：`RouteFormModal.test.ts` 新增「保存成功 toast 统一为『已保存。配置尚未发布，需发布后才会在 Edge 节点生效』」，覆盖新建 / 编辑 / 复制三个分支（现断言 `路由已更新` 等旧文案的用例一并改写）
- [x] 1.2 RED：断言保存成功后 `showOverlayModal` 被调用且参数为 `{ title, content: 配置尚未发布…, okText: '立即发布', cancelText: '稍后', onOk: fn }`
- [x] 1.3 RED：断言点击「立即发布」触发 `emit('publish-requested')`，载荷含 `clusterId` / `routeId` / `name` / `currentVersion`
- [x] 1.4 RED：断言 DNS 路由（`form.plugins` 含 `plugin_name === 'dns_upstream'`）保存后弹窗**不提供发布出口**（`onOk` 缺省，点击不 emit），文案含「DNS 路由请在『DNS 代理』页管理」
- [x] 1.5 GREEN：`RouteFormModal.vue` 实现（`defineEmits` 增 `publish-requested`；三处 toast 合并；`emit('saved')`/`emit('close')` 之后弹引导）
- [x] 1.6 RED：`RouteList.test.ts` 断言 `@publish-requested` 处理器设置 `publishingRecord`（含 `current_version`）/ `publishClusterId` 并打开既有 `PublishConfirmModal`；确认后 `executePublish` 打到 `/clusters/{id}/routes/{routeId}/publish`
- [x] 1.7 GREEN：`RouteList.vue` 实现 `onFormPublishRequested` 并接线

## 2. 集群路由 Tab：同款语义

- [x] 2.1 RED：`useClusterRoutes.test.ts` 断言新建 / 编辑保存 toast 为新文案，且调用 `showOverlayModal`（参数同 1.2）
- [x] 2.2 RED：断言「立即发布」走 `core.publishByRecord`（`openPublishModal` 被调用、节点确认后 `executePublish` 打到 `/clusters/{id}/routes/{rid}/publish`），且保存后集群路由列表已刷新（「待发布」可见）
- [x] 2.3 RED：断言 DNS 路由保存后引导无发布出口、文案为 DNS 代理页指路
- [x] 2.4 GREEN：`useClusterRoutes.ts` 实现 `showSavePublishGuide`（DNS 分支不带 `onOk`）

## 3. 收口验证

- [x] 3.1 `cd frontend && npx vitest run src/components/__tests__/RouteFormModal.test.ts src/views/__tests__/RouteList.test.ts src/composables/__tests__/useClusterRoutes.test.ts`（相关文件全绿）
- [x] 3.2 `cd frontend && npx vue-tsc -b`（类型验证走构建模式）
- [x] 3.3 全量串行单测 `npx vitest run --no-file-parallelism` 收口（判定波动先单文件复跑）
- [x] 3.4 真实页面验收（Playwright 直连 12345，10/10 通过）：路由管理页编辑保存 → toast「已保存。配置尚未发布…」+ 引导（稍后/立即发布）→ 点「立即发布」进既有发布确认弹窗（仍需手动「确认发布」，未自动发布）；统一管理集群路由 Tab 同款（保存后该行即为「待发布」，刷新生效）。**DNS 分支**：真实页面上 DNS 路由的行内操作本已禁用（列表/tab 均 tooltip 指路「DNS 代理」页），该分支只在「在表单里给路由挂 dns_upstream 插件」时可达，故由单测钉住（RouteFormModal G5 / useClusterRoutes DNS 用例），未做页面级演练
- [x] 3.5 `openspec validate route-save-publish-guidance`；用户确认后按 CLI 流归档（合并 delta 到 main specs）
