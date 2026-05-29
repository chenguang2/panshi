## Context

集群编辑表单的分组字段原先可空（undefined），导致 JSON.stringify 丢弃字段，后端无法清除分组。新建分组使用浏览器原生 prompt() 弹窗，体验不一致。

## Goals / Non-Goals

**Goals:**
- 分组字段始终有值，不可为空
- 新建分组内嵌在 Select 下拉中
- 未分组有展开收起
- 一键展开/收起所有分组

## Decisions

| 决策 | 方案 |
|------|------|
| 分组默认值 | `''` 空字符串，Select 显示「未分类」 |
| 新建分组 | Select 的 `dropdownRender` 插槽内嵌输入框 |
| 未分组展开收起 | 与命名分组共用 `expandedGroups['__ungrouped__']` |
| 全部展开/收起 | 遍历 `groupedClusters` 设置 `expandedGroups` |
