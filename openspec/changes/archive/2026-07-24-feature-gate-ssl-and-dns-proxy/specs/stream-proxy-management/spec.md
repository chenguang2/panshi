## MODIFIED Requirements

### Requirement: User can list stream proxies

The system SHALL display stream proxies in a card-grid layout with TCP 代理 view. DNS 代理[UDP] 已从本模块中分离，使用独立的 API 路径 `/clusters/{id}/dns-proxies` 和独立的前端页面 `/dns-proxies`，受 `dns_proxy_udp` feature 独立控制。此功能由 `stream_proxy` deployment feature 控制。

#### Scenario: List TCP proxies
- **WHEN** user clicks "TCP代理" in sidebar
- **THEN** the system navigates to `/stream-proxies`
- **AND** displays only `proxy_type=normal` proxies as cards
- **AND** page title SHALL be "TCP 代理"

#### Scenario: TCP proxy feature disabled
- **WHEN** `stream_proxy` feature 为 `false`
- **THEN** 侧边栏"TCP代理"菜单项 SHALL NOT 显示
- **AND** `/stream-proxies` 路由 SHALL NOT 注册
