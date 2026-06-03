## ADDED Requirements

### Requirement: 操作下拉菜单
表格操作列 SHALL 使用三点（⋯）按钮弹出下拉菜单。

#### Scenario: 菜单项
- **WHEN** 用户点击三点按钮
- **THEN** 下拉菜单 SHALL 显示「编辑」「启用/禁用」「删除」三个选项
- **AND** 点击「编辑」SHALL 打开编辑弹窗
- **AND** 点击「启用/禁用」SHALL 切换用户状态
- **AND** 点击「删除」SHALL 删除用户（确认后）

#### Scenario: 禁用/删除初始管理员保护
- **WHEN** 用户尝试禁用或删除初始管理员（admin, id=1）
- **THEN** 操作 SHALL 被拦截并显示错误提示
