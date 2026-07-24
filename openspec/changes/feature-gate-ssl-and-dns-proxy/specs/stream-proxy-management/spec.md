## MODIFIED Requirements

### Requirement: User can list TCP stream proxies

The system SHALL display TCP stream proxies in a card-grid layout. This feature is controlled by the `stream_proxy` deployment feature. DNS 代理[UDP] 已从本模块中分离，使用独立的 API 路径 `/clusters/{id}/dns-proxies` 和独立的前端页面 `/dns-proxies`，受 `dns_proxy_udp` feature 控制。

#### Scenario: List TCP proxies
- **WHEN** `stream_proxy` feature 为 `true`
- **AND** user clicks "TCP代理" in sidebar
- **THEN** the system navigates to `/stream-proxies`
- **AND** displays only `proxy_type=normal` proxies as cards

#### Scenario: TCP proxy feature disabled
- **WHEN** `stream_proxy` feature 为 `false`
- **THEN** 侧边栏"TCP代理"菜单项 SHALL NOT 显示
- **AND** `/stream-proxies` 路由 SHALL NOT 注册
