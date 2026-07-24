## MODIFIED Requirements

### Requirement: DNS 代理独立列表视图（卡片式）

系统 SHALL 提供独立的 DNS 代理列表页面（`/dns-queries`），以卡片形式展示所有启用了 `dns_upstream` 插件的 HTTP 路由。该页面 SHALL 受 `dns_proxy_http` 部署特性控制。

#### Scenario: 列表加载
- **WHEN** `dns_proxy_http` feature 为 `true`
- **AND** 用户点击侧边栏「DNS代理[HTTP]」
- **THEN** 页面 SHALL 调用 `GET /api/v1/routes?plugin=dns_upstream`
- **AND** 每张卡片 SHALL 展示：URI（顶栏）、DNS 标签、路由名称、所属集群、域名映射列表（每个域名显示算法/TTL/健康检查类型/IP:Port 列表）、发布状态/版本
- **AND** PageHeader 标题显示「DNS 查询」

#### Scenario: 功能禁用时隐藏
- **WHEN** `dns_proxy_http` feature 为 `false`
- **THEN** 侧边栏「DNS代理[HTTP]」菜单项 SHALL NOT 显示
- **AND** `/dns-queries` 路由 SHALL NOT 注册
- **AND** 用户直接访问 `/dns-queries` SHALL 显示 404
