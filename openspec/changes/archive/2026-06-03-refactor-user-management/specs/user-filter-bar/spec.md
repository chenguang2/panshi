## ADDED Requirements

### Requirement: 用户筛选栏
用户列表顶部 SHALL 显示筛选栏，包含搜索框、角色筛选、状态筛选和用户计数。

#### Scenario: 搜索过滤
- **WHEN** 用户在搜索框输入文字
- **THEN** 表格 SHALL 仅显示用户名包含搜索文字的用户
- **AND** 用户计数 SHALL 实时更新

#### Scenario: 角色筛选
- **WHEN** 用户选择角色筛选（全部/管理员/普通用户）
- **THEN** 表格 SHALL 仅显示对应角色的用户

#### Scenario: 状态筛选
- **WHEN** 用户选择状态筛选（全部/启用/禁用）
- **THEN** 表格 SHALL 仅显示对应状态的用户
