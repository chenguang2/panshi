## ADDED Requirements

### Requirement: cluster 子页面表格内视觉统一
6 个 cluster 子页面（Upstreams/Routes/PluginConfigs/GlobalRules/Nodes/StaticResources）的表格内部视觉元素 SHALL 使用新组件。

#### Scenario: 状态列使用 BadgeStatus
- **WHEN** 表格状态列渲染
- **THEN** 状态文字 SHALL 使用 BadgeStatus 组件（在线/离线/启用/禁用）

#### Scenario: 方法列使用 MethodTag（Routes 子页面）
- **WHEN** Routes 子页面表格的方法列渲染
- **THEN** HTTP 方法 SHALL 使用 MethodTag 组件（GET/POST/PUT/DELETE/PATCH）
