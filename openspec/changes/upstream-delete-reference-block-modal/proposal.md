# upstream-delete-reference-block-modal

## Why

2026-11-22 用户实测反馈：批量删除上游时，如果选中的上游**全部**被路由引用，前端只弹一条 toast（`message.warning`，约 3 秒自动消失），用户来不及看清「哪些上游被引用、被哪些路由引用」。

同一平台的**插件组**删除已有既定做法（PLG-07 / H4 决策 A）：被引用时不弹删除确认，改为 `showOverlayModal` 阻断弹窗，标题「无法删除：插件组仍被路由引用」，正文列出引用它的路由名（超 3 条折叠为「等 N 条路由」），只有「我知道了」一个按钮——用户有充分时间阅读。

产品一致性要求把上游的阻断提示对齐插件组这一形态。

## What Changes

- `upstream-batch-delete` 的「全部被引用」场景由「show the warning（toast）」改为「阻断弹窗」：
  - 弹窗标题含「无法删除：上游仍被路由引用」语义；
  - 正文逐个列出被阻断的上游名与其引用路由名（每个上游最多列 3 条，超出折叠为「等 N 条」）；
  - 仅「我知道了」一个按钮，**无任何删除入口**；
  - 依旧不打开删除确认框、不发送删除请求。
- 部分被引用（已在确认框 `extraWarning` 中提示）保持现有形态，但提示中 SHALL 带上引用路由名（不再只给条数），便于用户直接定位。

## Impact

- 前端：`views/UpstreamList.vue`（阻断提示改为 `showOverlayModal`）、`api/upstreams.ts`（复用已有 `fetchUpstreamReferences` 返回的 `routes`）。
- 后端：无（预检端点批次 B2 已提供 `routes: [{route_id, route_name}]`）。
- 规格：`openspec/specs/upstream-batch-delete/spec.md` 一个 Scenario 改写 + 一条 Scenario 增补。
- 参考实现：`composables/useClusterUtils.ts::showReferencedDeleteBlock`（插件组阻断弹窗，单点）。
