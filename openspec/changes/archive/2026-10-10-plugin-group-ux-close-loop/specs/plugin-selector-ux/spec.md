# plugin-selector-ux Delta

## ADDED Requirements

### Requirement: Empty state copy is context-neutral

PluginSelector 空面板文案 SHALL 语境中性，MUST NOT 写死某一消费场景。

#### Scenario: 空面板文案不预设消费方
- **WHEN** 左侧插件面板加载完成但无插件可选，或右侧未选择任何插件
- **THEN** 空态文案 SHALL 为「点击左侧插件添加」，MUST NOT 携带特定消费方语境（如「添加到路由」——该组件同时被插件组表单复用）
