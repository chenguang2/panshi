## Why

配置对比 Drawer 中，展开的字段级差异内容渲染在分组的底部，与本条数据行距离过远，视觉上难以对应。

## What Changes

- 将字段级差异展开从分组底部独立循环改为内联渲染，紧跟在本条数据行下方
- 移除不再需要的 `expandedItemsList` 计算属性

## Capabilities

### New Capabilities
<!-- 本次无新增能力 -->

### Modified Capabilities
- `config-diff`: 配置对比中差异展开项的渲染位置从分组底部改为行内

## Impact

- `frontend/src/views/ConfigDiff.vue` — 模板结构调整，移除 `expandedItemsList` computed
