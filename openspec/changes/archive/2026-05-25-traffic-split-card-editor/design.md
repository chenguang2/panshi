## Context

`traffic_split` 的 `splits` 是数组结构，每项包含 `ups_expr`（条件表达式）和 `upstreams`（上游负载列表）。现有表单单字段渲染为 JSON 文本框，用户需手写复杂嵌套 JSON。

PluginEditorDrawer 已有双模式（表单/JSON）切换，表单模式按 schema 类型逐字段渲染。需为 `splits` 字段添加专用渲染分支，参考 headers 字段的特殊手风琴处理方式。

## Decisions

- **内联实现而非独立组件**：与 headers 编辑器的处理方式一致，降低复杂度
- **每策略可单独切换 JSON**：条件可能很复杂，让用户按需选择编辑方式
- **条件值智能转换**：纯数字 → number，引号包裹 → 去除引号保留字符串，其他 → 字符串
- **示例可折叠**：用 JsonEditorVue 只读模式展示，与现有示例展示方式一致
