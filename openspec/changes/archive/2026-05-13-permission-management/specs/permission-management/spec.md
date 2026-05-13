## ADDED Requirements

### Requirement: 用户权限管理
系统 SHALL 支持管理员为普通用户分配权限，无权限的功能 Tab 对用户不可见。

#### Scenario: 管理员分配权限
- **WHEN** 管理员编辑用户时勾选权限
- **THEN** 该用户登录后 SHALL 看到有权限的功能 Tab

#### Scenario: 无权限则隐藏 Tab
- **WHEN** 用户没有 plugin_groups 权限
- **THEN** 集群管理的插件组 Tab SHALL 隐藏
- **AND** 路由弹窗的插件组 Tab SHALL 隐藏
