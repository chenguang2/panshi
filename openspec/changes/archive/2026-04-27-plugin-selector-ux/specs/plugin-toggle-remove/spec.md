## Summary

右侧已选插件列表中，点击任意 `selected-item` 直接移除该插件，并播放红色确认闪烁动画，防止用户误触。

## User Interactions & Flows

1. 用户在右侧已选插件列表 hover，视觉提示变为红色边框（暗示可点击）
2. 用户点击某个 `selected-item`
3. 触发红色闪烁动画（300ms）：背景从 `#fff` → `#fff1f0` → `#ff4d4f` → 透明
4. 动画结束后，执行 `splice(index, 1)` 移除插件
5. 拖拽排序功能保持正常（drag-handle 区域点击不触发移除）

## UI/UX Specification

### Visual Design

**默认状态**：
- background: `#fff`
- border: `1px solid #e8e8e8`

**Hover 状态**：
- border: `1px solid #ff4d4f`（红色边框暗示可点击）
- box-shadow: `0 2px 8px rgba(255, 77, 79, 0.15)`
- cursor: `pointer`
- 同时显示删除图标（目前需 hover 才可见，保留此行为）

**点击移除动画（300ms）**：
```
0ms:   background #fff (起始)
150ms: background #fff1f0 (淡红)
300ms: background transparent (消失)
→ DOM splice 发生在 300ms 后
```

### Behavior

- 点击 `selected-item` 触发移除（排除 drag-handle 区域）
- drag-handle 的 `@click` 阻止冒泡，不触发移除
- 删除图标点击始终有效（不受动画影响）
- 同时存在 `.removing` class 时，click 事件忽略（防止动画期间重复触发）

## Technical Approach

1. `selected-item` 增加 `@click="handleRemove(index)"` 事件
2. `drag-handle` 增加 `@click.stop` 阻止冒泡
3. CSS 添加 `.selected-item.removing` 动画关键帧
4. `handleRemove(index)` 函数：
   - 若 `draggedIndex !== null`（正在拖拽），忽略 click
   - 添加 `removing` class
   - `setTimeout(300ms)` 后执行实际的 splice
   - 更新 `emit('update:modelValue', ...)`

## Files to Modify

- `frontend/src/components/TwoColumnPluginSelector.vue`
  - line 73-105: `.selected-item` 模板增加 `@click`
  - line 84: `.drag-handle` 增加 `@click.stop`
  - line 244-246: `handleRemove` 函数修改
  - 新增 CSS `.selected-item.removing` 动画

## Acceptance Criteria

- [ ] 点击右侧已选插件，播放红色闪烁动画后移除
- [ ] 拖拽操作不受影响（drag-handle 点击不触发移除）
- [ ] 动画期间再次点击不会重复触发
- [ ] hover 时红色边框提示可点击
- [ ] 删除图标操作保持正常