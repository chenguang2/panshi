## ADDED Requirements

### Requirement: 用户新建/编辑弹窗
用户新建和编辑使用同一个弹窗，根据模式切换 UI。

#### Scenario: 新建模式
- **WHEN** 用户点击「+ 新建用户」
- **THEN** 弹窗标题 SHALL 显示「新建用户」
- **AND** 显示用户名输入、角色下拉、密码输入（必填）、启用复选框
- **AND** 权限区域可见（非管理员角色时）

#### Scenario: 编辑模式
- **WHEN** 用户点击编辑某用户
- **THEN** 弹窗标题 SHALL 显示「编辑用户 — 用户名」
- **AND** 用户名输入 SHALL 已填写
- **AND** 密码输入 SHALL 隐藏
- **AND** 密码重置区域 SHALL 显示（含新密码输入 + 重置密码按钮）

#### Scenario: 保存用户
- **WHEN** 用户点击保存
- **THEN** 新建时 SHALL 校验用户名必填和密码至少 6 位
- **AND** 保存后 SHALL 刷新用户列表
- **AND** 显示成功提示
