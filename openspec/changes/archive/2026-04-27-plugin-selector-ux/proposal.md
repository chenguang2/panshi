## Why

TwoColumnPluginSelector 组件中，左侧插件描述文字被截断（max-width: 140px），用户 hover 时无法看到完整说明。此外，右侧已选插件的删除操作仅通过小的删除图标完成，误触风险高，且不符合"点击添加/点击取消"的直觉交互模式。

## What Changes

1. **Hover 显示完整描述**：鼠标悬停在左侧插件时，若描述文字被截断，显示 Tooltip 展示完整描述
2. **点击取消插件**：点击右侧已选插件直接触发移除，并增加红色确认动画反馈，防止误触
3. **选中态视觉提示**：右侧已选插件 hover 时显示红色边框/背景，暗示可点击取消

## Capabilities

### New Capabilities
- `plugin-hover-tooltip`: 左侧插件 hover 时显示完整描述的 Tooltip 机制
- `plugin-toggle-remove`: 右侧已选插件点击直接移除，并带红色闪烁确认动画

### Modified Capabilities
- (无现有 spec 需要修改)

## Impact

- **文件**: `frontend/src/components/TwoColumnPluginSelector.vue`, `frontend/src/components/PluginSelector.vue`
- **依赖**: Ant Design Vue `a-tooltip` 组件（已引入）
- **测试**: E2E 测试中 `cluster-list-route-modal-tabs.spec.ts` 的插件 Tab 操作