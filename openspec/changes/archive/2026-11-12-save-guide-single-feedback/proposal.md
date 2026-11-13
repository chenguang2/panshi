# Proposal

## Why

保存后的发布引导上线后（`route-save-publish-guidance` + 上游域既有实现），路由与上游的保存流程同时产生两条反馈：一条 `message.success` toast 与一个「保存成功 / 稍后 / 立即发布」引导弹窗。但引导弹窗是手写 `.modal-overlay`、`z-index: 2000`（`useOverlayModal.ts`），而 antd `message` 默认 `z-index: 1010`——**toast 恒在遮罩之下**，被压暗到看不清，且 3 秒自动消失。用户实际只看到一条有效提示（弹窗），toast 既不生效也不承载增量信息（弹窗标题「保存成功」+ 正文已覆盖其全部语义）。用户报告「toast 弹窗在后面」，判定为重复且失效的反馈通道。

顺序修法不是把 toast 提到遮罩之上（那会在遮罩上飘一条自动消失的横条，更干扰），而是**单通道**：保存成功只由弹窗呈现。

同时需钉住一条边界，防止后续把这类提示做成可关闭的配置项：**「配置尚未发布」属于正确性提示，不可关闭；可配置的只能是呈现形式。**

## What Changes

- **删除 4 个入口的保存成功 toast**（这些入口随后都会弹发布引导弹窗，toast 只是被遮罩压住的重复项）：
  - 路由独立页 `components/RouteFormModal.vue`
  - 集群路由 Tab `composables/useClusterRoutes.ts`
  - 上游表单 `components/UpstreamFormModal.vue`
  - 集群上游 Tab `composables/useClusterUpstreams.ts`
- **保留 toast 的入口**（无引导弹窗，toast 是其唯一即时反馈）：插件组 `PluginEntityFormModal.vue` / `useClusterPluginEntity.ts`（不在本次范围，行为不变）。
- **保留失败反馈**：上述 4 个入口的 `message.error` 一律不动——失败路径没有弹窗，MUST NOT 因单通道改造丢失失败提示。
- **文案不动**：弹窗标题保持「保存成功」、正文保持「配置尚未发布，发布后才会推送到 Edge 节点生效。」（DNS 路由分支保持指路文案），仅移除与之重复的 toast；列表「待发布」标签继续承担持久信号。
- **新增跨域需求** `save-feedback-single-channel`：单通道反馈规则 + 「未发布提示不可关闭、仅形式可配」的边界。
- **改 4 份主需求**（`route-management` / `cluster-routes-component` / `upstream-management` / `cluster-upstreams-component`）中「保存成功提示语义」场景，把「SHALL 弹 toast」反转为「SHALL NOT 弹 toast，仅由引导弹窗呈现」。
- **不做**：不引入 `features.yaml` 开关，不做用户偏好「以后不再询问」，不把集群级「未发布变更」工具条纳入本轮（方向已列为后续，见 design D5）。

## Capabilities

### New Capabilities

- `save-feedback-single-channel`：跨域保存反馈通道规则（单通道、失败必反馈、未发布提示不可关）。

### Modified Capabilities

- `route-management`：保存成功提示语义改为单通道（无 toast）。
- `cluster-routes-component`：同上（集群路由 Tab）。
- `upstream-management`：同上（全局上游表单）。
- `cluster-upstreams-component`：同上（集群内上游表单）。

## Impact

- 代码：4 个文件各删 1 行 `message.success`；无接口、无后端、无数据库改动。
- 测试：`RouteFormModal.test.ts`、`useClusterRoutes.test.ts`、`UpstreamFormModal.test.ts`、`useClusterUpstreams.test.ts` 中 11 处「断言 toast 文案」改为「断言不弹 toast 且弹引导弹窗」。
- 用户可见：保存后只有一条提示（弹窗），不再出现被压暗的 toast；成功/失败反馈均不缺失。
