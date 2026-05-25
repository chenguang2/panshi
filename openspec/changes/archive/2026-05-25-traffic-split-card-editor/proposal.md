## Why

traffic_split 插件的 `splits` 配置结构复杂（嵌套的条件表达式 + 上游负载列表），纯 JSON 文本框编辑体验差且容易出错。需要可视化的卡片式编辑器，同时保留 JSON 模式应对复杂场景。

## What Changes

- PluginEditorDrawer 中为 `splits` 字段新增卡片式可视化编辑器
- 每个策略显示为独立卡片，含条件表达式行编辑 + 上游下拉选择
- 支持每个策略单独切换 JSON/表单模式
- 底部提供可展开的配置示例参考
- 条件值智能类型转换（数字 / 字符串 / 引用字符串）

## Capabilities

### New Capabilities
- `traffic-split-card-editor`: traffic_split 插件的卡片式可视化编辑器

### Modified Capabilities
（无）

## Impact

- `frontend/src/components/PluginEditorDrawer.vue` — 新增 splits 卡片编辑器模板 + 逻辑 + 样式
