# Tasks

## 1. 路由域（独立页 + 集群 Tab）

- [x] 1.1 RED：`components/__tests__/RouteFormModal.test.ts` 断言保存成功 SHALL NOT 调用 `message.success`、SHALL 调用 `showOverlayModal`（标题「保存成功」），覆盖新建 / 编辑 / 复制三路径；现有断言 toast 文案的用例一并改写
- [x] 1.2 RED：`composables/__tests__/useClusterRoutes.test.ts` 同上（集群路由 Tab 新建 / 编辑）
- [x] 1.3 GREEN：`components/RouteFormModal.vue` 删除成功 toast（`handleSubmit` 内一行），保留 `message.error` 与 DNS 分支引导
- [x] 1.4 GREEN：`composables/useClusterRoutes.ts` 删除成功 toast，保留 `message.error`；保存后刷新与引导逻辑不变

## 2. 上游域（全局表单 + 集群 Tab）

- [x] 2.1 RED：`components/__tests__/UpstreamFormModal.test.ts` 同 1.1
- [x] 2.2 RED：`composables/__tests__/useClusterUpstreams.test.ts` 同 1.1
- [x] 2.3 GREEN：`components/UpstreamFormModal.vue` 删除成功 toast，保留失败分支
- [x] 2.4 GREEN：`composables/useClusterUpstreams.ts` 删除成功 toast，保留失败分支

## 3. 边界守卫（不改行为，只钉规则）

- [x] 3.1 `components/__tests__/PluginEntityFormModal.test.ts` 与 `composables/__tests__/useClusterPluginEntity.test.ts` 继续断言成功 toast（无引导弹窗入口保留 toast）——确认未被顺带清理
- [x] 3.2 源码守卫：新增断言「`features.yaml` 不含保存提示类开关」的最小用例（或并入既有 features 守卫测试），钉住 D3 的配置边界

## 4. 收口验证

- [x] 4.1 `cd frontend && npx vitest run src/components/__tests__/RouteFormModal.test.ts src/composables/__tests__/useClusterRoutes.test.ts src/components/__tests__/UpstreamFormModal.test.ts src/composables/__tests__/useClusterUpstreams.test.ts`（相关文件全绿）
- [x] 4.2 `cd frontend && npx vue-tsc -b`
- [x] 4.3 全量串行单测 `npx vitest run --no-file-parallelism` 收口
- [x] 4.4 真实页面验收（Playwright 直连 12345）：4 个入口保存后只有引导弹窗、无被遮罩压暗的 toast；失败路径（如重名冲突）仍有 `message.error`
- [x] 4.5 `openspec validate --all`；用户确认后归档（合并 delta 到 main specs）

### 实施记录（2026-11-12）

- 1.1–2.4：9 条 RED 用例（3 路由表单 + 1 集群路由 Tab + 3 上游表单 + 2 集群上游 Tab）先红后绿，落点 4 处一行删除：`RouteFormModal.vue::handleSubmit`、`useClusterRoutes.ts::handleRouteSubmit`、`UpstreamFormModal.vue` 保存段、`useClusterUpstreams.ts::handleUpstreamSubmit`。`message.error`（失败）与插件组两处 toast（`PluginEntityFormModal.vue` / `useClusterPluginEntity.ts`，无引导弹窗入口）均保留。
- 顺带统一（单通道的必要条件）：`useClusterUpstreams.ts` 引导弹窗标题原为「配置尚未发布」，toast 移除后无法承担「已保存」语义，改为「保存成功」，与其点三处（路由表单/路由 Tab/上游表单）一致；`useClusterUpstreams.test.ts` 加标题断言。
- 3.2：守卫落在 `backend/tests/test_features.py::TestNoSaveFeedbackFeatureSwitch`（读取真实 features.yaml，禁止 toast / save_publish / publish_guide / save_guide / save_feedback / publish_confirm 类键）。
- 4.4：Playwright 直连 12345 验收 5/5 —— A 独立路由页、B 独立上游页、C 集群路由 Tab（test-3）、D 集群上游 Tab、E 失败路径（拦截 PUT → `message.error`「Network Error」，且不弹引导）。四入口保存后可见层仅「保存成功」弹窗（稍后/立即发布），`.ant-message-notice` 计数 0。
- 注：验收各保存一次（字段未改），相关行因此转为「待发布」；未发布、未推 Edge。
