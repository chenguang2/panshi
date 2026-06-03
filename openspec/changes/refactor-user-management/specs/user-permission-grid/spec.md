## ADDED Requirements

### Requirement: 资源权限网格
用户编辑弹窗中 SHALL 显示资源权限复选框网格（仅非管理员用户可见）。

#### Scenario: 权限选项
- **WHEN** 用户角色为非管理员
- **THEN** 弹窗 SHALL 显示 4 个权限复选框：插件组管理、全局规则管理、边缘节点管理、插件管理
- **AND** 各权限 SHALL 对应后端 key：`plugin_groups`、`global_rules`、`edge_nodes`、`plugin_management`

#### Scenario: 管理员隐藏权限
- **WHEN** 用户角色为管理员
- **THEN** 资源权限区域 SHALL 隐藏

#### Scenario: 权限提交
- **WHEN** 用户保存用户信息
- **THEN** 勾选的权限 key SHALL 通过 `PUT /admin/users/{id}/permissions` 提交到后端
- **AND** 权限列表 SHALL 从后端重新加载以确保状态一致
