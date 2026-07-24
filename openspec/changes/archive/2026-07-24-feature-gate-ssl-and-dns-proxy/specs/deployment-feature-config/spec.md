## ADDED Requirements

### Requirement: Configuration items — ssl_cert, dns_proxy_udp, dns_proxy_http

The deployment feature configuration SHALL support three new feature names in the `features.features` mapping.

| Feature name | Default | Controls |
|---|---|---|
| `ssl_cert` | `true` | SSL 证书管理页面、API 路由、侧边栏菜单 |
| `dns_proxy_udp` | `true` | DNS 代理[UDP] 页面、API 路由、侧边栏菜单 |
| `dns_proxy_http` | `true` | DNS 代理[HTTP]（DNS 查询管理）页面、侧边栏菜单 |

#### Scenario: ssl_cert enabled
- **WHEN** `features.yaml` 中 `ssl_cert` 为 `true` 或未配置
- **THEN** SSL 证书管理功能 SHALL 可用
- **AND** `GET /api/v1/clusters/{id}/ssl-certificates` SHALL 返回 200

#### Scenario: ssl_cert disabled
- **WHEN** `features.yaml` 中 `ssl_cert` 为 `false`
- **THEN** SSL 证书管理相关 API SHALL 返回 404
- **AND** 侧边栏「SSL 证书」菜单项 SHALL 隐藏
- **AND** `/ssl` 前端路由 SHALL NOT 注册

#### Scenario: dns_proxy_udp enabled
- **WHEN** `features.yaml` 中 `dns_proxy_udp` 为 `true` 或未配置
- **THEN** DNS 代理[UDP] 功能 SHALL 可用

#### Scenario: dns_proxy_udp disabled
- **WHEN** `features.yaml` 中 `dns_proxy_udp` 为 `false`
- **THEN** 侧边栏「DNS代理[UDP]」菜单项 SHALL 隐藏
- **AND** 前端 `/stream-proxies?type=dns` 路由 SHALL NOT 注册

#### Scenario: dns_proxy_http enabled
- **WHEN** `features.yaml` 中 `dns_proxy_http` 为 `true` 或未配置
- **THEN** DNS 代理[HTTP] 功能 SHALL 可用

#### Scenario: dns_proxy_http disabled
- **WHEN** `features.yaml` 中 `dns_proxy_http` 为 `false`
- **THEN** 侧边栏「DNS代理[HTTP]」菜单项 SHALL 隐藏
- **AND** 前端 `/dns-queries` 路由 SHALL NOT 注册
