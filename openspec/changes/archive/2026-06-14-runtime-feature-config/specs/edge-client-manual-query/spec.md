# edge-client-manual-query — Delta Spec

## ADDED Requirements

### Requirement: Edge 直连功能受特性配置控制

Edge 直连页面 SHALL 受 `features.yaml` 中 `edge_client` 特性控制。

#### Scenario: Edge 直连启用
- **WHEN** `features.yaml` 中 `edge_client` 为 `true`
- **THEN** `/edge-client` 路由 SHALL 注册
- **AND** 侧边栏 Edge 直连菜单项 SHALL 显示
- **AND** 后端 `GET /api/v1/edge-client/nodes` SHALL 可用（返回 200）

#### Scenario: Edge 直连禁用
- **WHEN** `features.yaml` 中 `edge_client` 为 `false`
- **THEN** `/edge-client` 路由 SHALL NOT 注册（访问返回 404）
- **AND** 侧边栏 Edge 直连菜单项 SHALL NOT 显示
- **AND** 后端所有 `/api/v1/edge-client/*` 端点 SHALL 返回 404
- **AND** 用户无法通过 URL 直接访问该功能
