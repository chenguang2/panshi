# ssl-certificate-management Delta

## MODIFIED Requirements

### Requirement: SSL 证书列表展示

系统 SHALL 提供一个独立 SSL 证书管理页面（`/ssl`），以卡片网格形式展示所有集群的 SSL 证书。该页面 SHALL 受 `ssl_cert` 部署特性控制：当 `ssl_cert` 禁用时，前端路由和侧边栏菜单 SHALL NOT 注册/显示，API 端点 SHALL 返回 404。证书卡片 SHALL 展示到期信息并对临期/已过期证书给出预警徽章。

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

#### Scenario: 证书卡片展示到期徽章

- **WHEN** 证书卡片渲染且证书含有效期信息
- **THEN** 卡片 SHALL 显示到期徽章「剩余 N 天」
- **AND** 剩余天数 < 0 时 SHALL 显示已过期预警
- **AND** 剩余天数 ≤ 30 时 SHALL 显示临期预警
- **AND** 其余情况 SHALL 正常显示剩余天数

#### Scenario: 列表响应携带到期计算字段

- **WHEN** 前端请求 SSL 证书列表
- **THEN** 后端响应 SHALL 包含证书到期时间与剩余天数计算字段（守卫测试 `backend/tests/test_ssl_expiry.py`）
