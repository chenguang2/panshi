## ADDED Requirements

### Requirement: 角色徽章
用户表中角色列 SHALL 显示彩色徽章标识用户角色。

#### Scenario: 管理员徽章
- **WHEN** 用户角色为 admin
- **THEN** 徽章 SHALL 显示文字「管理员」
- **AND** 徽章背景 SHALL 为蓝色系

#### Scenario: 普通用户徽章
- **WHEN** 用户角色为 user
- **THEN** 徽章 SHALL 显示文字「普通用户」
- **AND** 徽章背景 SHALL 为绿色系
