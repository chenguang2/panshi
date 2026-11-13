# Design

## Context

`route-save-publish-guidance` 与上游域既有实现让「保存 ≠ 生效」语义落地，但两个通道同时发声：

- 引导弹窗：手写 `.modal-overlay`，`z-index: 2000`（`composables/useOverlayModal.ts:114`，内联样式）。
- 成功 toast：antd `message`，默认 `z-index: 1010`。

即 toast 渲染在遮罩**之下**，被压暗且 3 秒自动消失；其文案与弹窗正文完全重复。现状不是「两条提示并存」，而是「一条有效 + 一条无效」。

当前 4 个「toast 后紧跟弹窗」的入口（`grep -rn "已保存。配置尚未发布" src` 的 6 处中）：

| 入口 | toast 后是否弹引导 |
|---|---|
| `components/RouteFormModal.vue`（路由独立页，新建/编辑/复制） | 是 |
| `composables/useClusterRoutes.ts`（集群路由 Tab） | 是 |
| `components/UpstreamFormModal.vue`（上游表单） | 是 |
| `composables/useClusterUpstreams.ts`（集群上游 Tab） | 是 |
| `components/PluginEntityFormModal.vue`（插件组） | 否 |
| `composables/useClusterPluginEntity.ts`（插件组 Tab） | 否 |

## Goals / Non-Goals

- Goals：去掉无效且重复的那条通道；4 个入口语义一致；钉住「未发布提示不可关闭，形式可配」的边界，防未来把正确性提示做成开关。
- Non-Goals：不做用户偏好（「以后不再询问」）；不把集群级「未发布变更」工具条纳入本轮；不改插件组行为；不动后端、`PublishConfirmModal` / `executePublish` / 版本管理链路；不统一其余资源域（四层代理 / DNS 代理 / SSL / 静态资源）的同类缺口。

## Decisions

### D1 删 toast，而不是提高 toast 的 z-index
- 选：保存引导弹窗在位时不再 `message.success`。
- 弃：把 `message.config({ zIndex: 2100 })` 抬高到遮罩之上。
- 理由：抬 z-index 会让一条自动消失的横条飘在遮罩上——比现状更干扰，且仍是重复信息。单通道是唯一不需解释的形态。

### D2 文案一字不改，只删通道
- 选：弹窗标题保持「保存成功」、正文保持「配置尚未发布，发布后才会推送到 Edge 节点生效。」，DNS 分支保持「DNS 路由请在『DNS 代理』页管理」。
- 理由：这已是上轮刚统一的文案，且语义完整（标题承担「已保存」）；同时把测试改动压到最小（只反转「是否弹 toast」）。

### D3 不做 `features.yaml` 开关（明确否决）
- 弃 `features.show_save_toast` / `features.show_publish_confirm`。
- 理由 ①（语义错位）：`backend/features.yaml` 现有键全部是部署级能力闸门（`stream_proxy` / `relay_gateway` / `force_default_password_change` …），一实例一取值；而「要不要弹保存引导」是个人交互偏好，本平台多用户共享同一后端，无法各自选择。
- 理由 ②（成本倒挂）：按约定 #61 一个开关需四层接线 + 守卫测试，且 `toast × 弹窗` 组合膨胀为 4 种状态；收益仅是消除噪音，而噪音根因（层叠 + 重复）删 toast 即消失。
- 理由 ③（危险方向）：「配置是否显示立即发布弹窗」等于允许关掉「配置尚未发布」这条正确性提示，用户会重新误以为保存即生效——正是本类需求要解决的问题。

### D4 插件组保留 toast
无引导弹窗时 toast 是唯一即时反馈，删掉即静默保存。该域不在本轮范围，仅在新增需求里写明边界，避免后续「统一清理 toast」误删。

### D5 后续方向（本轮不实现，仅记录）
集群级「未发布变更 N 项 · 立即发布」工具条，可替代逐条保存即打断的弹窗；它同时治「待发布标签满屏橙色＝无效信号」的问题——变更态本应是集群级汇总而非逐条喇叭。届时若引入「以后不再询问」偏好，须保证未发布信息仍有持久形态（`save-feedback-single-channel` 已钉住该前提）。

### D6 失败路径一律不动
4 个入口的 `message.error` 与表单内联校验红字保持原样：失败时没有弹窗兜底，缺即时反馈会退化为「点保存没反应」。

## Risks

| 风险 | 缓解 |
|---|---|
| 删 toast 后用户感知「保存没成功」 | 弹窗标题即「保存成功」；验收在真实页面确认弹窗先于任何列表刷新动作出现 |
| 单通道规则被外推成「删掉所有保存 toast」 | `save-feedback-single-channel` 的「无引导弹窗入口保留 toast」场景 + 插件组测试继续断言 toast |
| 未来偏好做成 `features.yaml` 开关 | 需求层显式禁止（配置项边界场景） |

## Verification

1. RED：4 个测试文件断言「不调用 `message.success`」且「`showOverlayModal` 被调用（标题『保存成功』）」，覆盖新建/编辑/复制分支与 DNS 分支。
2. GREEN：4 个实现文件各删 1 行成功 toast。
3. `npx vue-tsc -b` + 全量串行 `npx vitest run --no-file-parallelism`。
4. 真实页面验收：路由独立页、集群路由 Tab、上游表单、集群上游 Tab —— 保存后**只有弹窗**，无被遮罩压暗的 toast。
