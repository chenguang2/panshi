# edge-data-import — Delta Spec

## ADDED Requirements

### Requirement: 数据导入功能受特性配置控制

Edge 数据导入功能 SHALL 受 `features.yaml` 中 `edge_import` 特性控制。

#### Scenario: 数据导入启用
- **WHEN** `features.yaml` 中 `edge_import` 为 `true`
- **THEN** `/edge-import` 路由 SHALL 注册
- **AND** 侧边栏数据导入菜单项 SHALL 显示
- **AND** 后端 `/api/v1/edge-import/*` 端点 SHALL 可用

#### Scenario: 数据导入禁用
- **WHEN** `features.yaml` 中 `edge_import` 为 `false`
- **THEN** `/edge-import` 路由 SHALL NOT 注册
- **AND** 侧边栏数据导入菜单项 SHALL NOT 显示
- **AND** 后端所有 `/api/v1/edge-import/*` 端点 SHALL 返回 404
