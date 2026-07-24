## MODIFIED Requirements

### Requirement: SSL 证书列表展示

系统 SHALL 提供一个独立 SSL 证书管理页面（`/ssl`），以卡片网格形式展示所有集群的 SSL 证书。该页面 SHALL 受 `ssl_cert` 部署特性控制：当 `ssl_cert` 禁用时，前端路由和侧边栏菜单 SHALL NOT 注册/显示，API 端点 SHALL 返回 404。

#### Scenario: 页面入口
- **WHEN** `features.yaml` 中 `ssl_cert` 为 `true`
- **AND** 用户点击侧边栏"SSL 证书"菜单项
- **THEN** 导航到 `/ssl` 路由
- **AND** 页面显示 `PageHeader`，标题为"SSL 证书"

#### Scenario: 功能禁用时隐藏
- **WHEN** `features.yaml` 中 `ssl_cert` 为 `false`
- **THEN** 侧边栏"SSL 证书"菜单项 SHALL NOT 显示
- **AND** `/ssl` 路由 SHALL NOT 注册
- **AND** 用户直接访问 `/ssl` SHALL 显示 404
