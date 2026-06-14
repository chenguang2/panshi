# dev-tools — Delta Spec

## ADDED Requirements

### Requirement: 工具箱功能受特性配置控制

工具箱页面 SHALL 受 `features.yaml` 中 `tools` 特性控制。

#### Scenario: 工具箱启用
- **WHEN** `features.yaml` 中 `tools` 为 `true`
- **THEN** `/tools` 路由 SHALL 注册
- **AND** 侧边栏工具箱菜单项 SHALL 显示

#### Scenario: 工具箱禁用
- **WHEN** `features.yaml` 中 `tools` 为 `false`
- **THEN** `/tools` 路由 SHALL NOT 注册
- **AND** 侧边栏工具箱菜单项 SHALL NOT 显示
- **AND** 用户无法访问工具箱页面（前端 404）
