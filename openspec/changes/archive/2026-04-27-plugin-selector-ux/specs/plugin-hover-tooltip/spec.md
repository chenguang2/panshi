## Summary

当用户在 TwoColumnPluginSelector 左侧插件列表 hover 时，若 `plugin-item-desc` 文字被截断（实际宽度超过 140px），则显示 Tooltip 展示完整的插件描述文字。

## User Interactions & Flows

1. 用户 hover 到某个 `plugin-item` 上
2. 系统检测该插件的描述是否被截断（通过比较 `scrollWidth` > `clientWidth` 或 CSS overflow 状态）
3. 若被截断，显示 `a-tooltip`，内容为完整 `plugin.description`
4. 用户移出鼠标，Tooltip 消失

## UI/UX Specification

### Visual Design
- Tooltip 背景色：`#1f1f1f`（Ant Design 默认 dark tooltip）
- Tooltip 最大宽度：`300px`（防止超长描述折叠过密）
- 字体：`12px`，颜色 `#ffffff`
- 延迟：`200ms`（防止快速划过时闪烁）

### Behavior
- Tooltip 位置：默认 `top`（跟随光标自动调整）
- `autoAdjustOverflow: true`：防止贴边

## Technical Approach

- 使用 `a-tooltip` 包裹 `plugin-item`
- `:title` 绑定完整 `plugin.description`
- 通过 CSS `ref` + JS 检测 `el.scrollWidth > el.clientWidth` 来判断是否截断，或直接始终显示（更简单）
- 考虑到性能，直接始终在 hover 时显示 Tooltip，Ant Design 会自动处理空白文字不显示

## Files to Modify

- `frontend/src/components/TwoColumnPluginSelector.vue`
  - line 37-50: `.plugin-item` 结构需要包裹 `a-tooltip`
  - 新增 `WarningOutlined` import（已有）

## Acceptance Criteria

- [ ] hover 截断的插件描述时，显示 Tooltip
- [ ] hover 未截断的插件时，不显示 Tooltip（空白时不触发）
- [ ] Tooltip 样式符合 Ant Design 默认 dark 主题
- [ ] 不影响现有 click 添加插件逻辑