# node-management Delta

## ADDED Requirements

### Requirement: 独立页节点列表配置

节点管理独立页 SHALL 提供列表配置能力（与统一管理 Tab 同一 `useColumnConfig` 机制）：本页表格列显隐、行动作按钮集、搜索框开关的配置与持久化。两入口配置各自独立存储（列集合不同，不互通）。

#### Scenario: 配置列显隐与动作按钮
- **WHEN** 用户打开独立页「列配置」弹层
- **THEN** SHALL 可勾选本页表格列的显示/隐藏与行动作按钮集
- **AND** 配置 SHALL 持久化，刷新页面后保持

#### Scenario: 独立页行动作按钮集生效
- **WHEN** 用户在列配置中调整动作按钮集
- **THEN** 节点行的直接动作按钮 SHALL 按所选集合渲染，未选动作收进「更多」菜单
