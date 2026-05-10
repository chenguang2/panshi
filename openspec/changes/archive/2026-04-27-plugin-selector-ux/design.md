## Context

TwoColumnPluginSelector.vue 是路由编辑 Tab 3（插件配置）的核心组件。当前实现：

- 左侧 `plugin-item-desc` CSS 设置 `max-width: 140px; overflow: hidden; text-overflow: ellipsis`
- 右侧删除仅通过 `DeleteOutlined` 图标触发（line 103），点击插件本身无操作

## Goals / Non-Goals

**Goals:**
- hover 时若描述被截断，显示完整描述的 Tooltip
- 点击右侧已选插件直接移除，并给予红色确认动画反馈
- 保持拖拽排序功能正常

**Non-Goals:**
- 不改变现有的删除图标操作（保留作为辅助操作）
- 不修改插件选中状态的判断逻辑
- 不涉及 PluginSelector.vue（另一个组件）

## Decisions

### 1. Hover Tooltip 实现
- 使用 Ant Design Vue `a-tooltip`，已有 `WarningOutlined` 可参考项目中其他 Tooltip 用法
- 条件：`plugin-item-desc` 实际宽度超过 `140px`（通过 JS 计算或 CSS 触发）
- 不修改现有 CSS，仅在 `plugin-item` 外层包裹 `a-tooltip`

### 2. 点击移除 + 动画确认
- 右侧 `selected-item` 增加 `@click` 事件，触发 `handleRemove(index)`
- 动画反馈：移除前播放 300ms 红色闪烁（`background-color: #fff1f0 → #ff4d4f → 0`）
- 动画结束后再执行实际的 `splice` 移除（避免 DOM 突变导致动画丢失）
- 实现方式：在 `handleRemove` 中先添加 `.removing` class，300ms 后再 splice

### 3. Hover 视觉提示
- `.selected-item:hover` 时 border 变为红色，暗示可点击
- 同时显示小的删除图标（目前需 hover 才可见）

## Risks / Trade-offs

| 风险 |  Mitigation |
|------|-------------|
| click 和 drag 冲突（drag 时触发 click） | 使用 `mousedown` + `setTimeout` 判断：300ms 内发生 drag 则忽略 click |
| 动画导致 DOM 闪烁 | 使用 CSS `transition`，Vue 的 `v-if` 配合 `transition` 组件 |
| Tooltip 覆盖密集列表 | `autoAdjustOverflow: true`，允许自动调整位置 |