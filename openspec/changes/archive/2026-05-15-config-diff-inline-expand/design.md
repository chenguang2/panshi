## Context

配置对比 Drawer（`ConfigDiff.vue`）中，展开的字段级差异内容通过 `expandedItemsList` 计算属性收集后，统一渲染在分组底部。当分组内有多个差异项时，视觉上难以将展开内容与触发行对应。

## Goals / Non-Goals

**Goals:**
- 展开的字段级差异内容渲染在本条数据行下方
- 移除不再需要的 `expandedItemsList` 计算属性

**Non-Goals:**
- 不改动后端 API 响应结构
- 不改动字段级对比展示的样式或内容

## Decisions

- **内联条件渲染**：将 `v-for` 从单层 `.diff-row` 改为外层容器 `<div>`，内联 `v-if` 条件渲染差异内容。不需要保留独立的 `expandedItemsList` 循环。
- **使用 `group.type` 代替 `item.groupType`**：内联渲染后可直接使用外层 `group.type`，无需在每个 item 上携带 `groupType`。

## Risks / Trade-offs

- 没有风险——纯模板结构调整，无逻辑变化。
