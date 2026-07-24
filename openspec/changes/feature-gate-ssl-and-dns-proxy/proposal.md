## Why

当前 SSL 证书管理、DNS 代理[UDP]、DNS 代理[HTTP] 三个功能缺少独立的 deployment-level feature gate，无法通过 `features.yaml` 在部署级别独立控制启停。其中 DNS 代理[UDP] 与 TCP 代理共用一个 `stream_proxy` 开关，粒度不够细；SSL 证书和 DNS 代理[HTTP] 则完全没有 feature gate（始终启用）。这导致运维人员无法按需裁剪功能集，无法满足不同客户/站点的差异化部署需求。

## What Changes

- **新增** `ssl_cert`、`dns_proxy_udp`、`dns_proxy_http` 三个 feature 名称，加入 `backend/app/core/features.py` 的 `KNOWN_FEATURES` 集合
- **修改** 后端路由注册：SSL 证书 API 路由从 `api_router`（始终注册）移至 `feature_routers`，受 `ssl_cert` 控制；DNS 代理[UDP] 从 `stream_proxy` 拆分为独立 `dns_proxy_udp` 控制，使用**独立 API 路径** `/clusters/{id}/dns-proxies`；DNS 代理[HTTP] 新增独立 `dns_proxy_http` feature gate（仅前端控制）
- **新增** `backend/app/api/v1/cluster_dns_proxies.py`：DNS UDP 代理独立路由文件，路径 `/clusters/{cluster_id}/dns-proxies`
- **修改** `cluster_stream_proxies.py`：精简为仅 TCP 代理 (`proxy_type=normal`) 相关代码
- **修改** 前端 `featureRouteMap`：新增 `ssl_cert`（`/ssl`）、`dns_proxy_udp`（`/dns-proxies`）、`dns_proxy_http`（`/dns-queries`）三条动态路由注册
- **新增** `frontend/src/views/DnsUdpProxyList.vue`：DNS UDP 代理独立页面
- **新增** `frontend/src/api/dnsProxy.ts`：DNS UDP 代理独立 API 模块
- **修改** 侧边栏：为「SSL 证书」「DNS代理[UDP]」「DNS代理[HTTP]」菜单项增加 `feature` 字段；DNS代理[UDP] 菜单路径从 `/stream-proxies?type=dns` 改为 `/dns-proxies`
- **修改** `features.yaml` 默认配置：三个新 feature 默认启用（保持向后兼容）
- **修改** `product/features.yaml`：同步添加三个新 feature
- **修改** `docs/design/features-config.md`：补充新 feature 的说明文档

## Capabilities

### New Capabilities
- `ssl-cert-feature-gate`: SSL 证书管理功能可通过 `features.yaml` 的 `ssl_cert` 开关独立控制
- `dns-proxy-udp-feature-gate`: DNS 代理[UDP] 功能可通过 `features.yaml` 的 `dns_proxy_udp` 开关独立控制（不再与 TCP 代理捆绑）
- `dns-proxy-http-feature-gate`: DNS 代理[HTTP]（DNS 查询管理）功能可通过 `features.yaml` 的 `dns_proxy_http` 开关独立控制

### Modified Capabilities
- `deployment-feature-config`: 新增三个受支持的 feature 名称：`ssl_cert`、`dns_proxy_udp`、`dns_proxy_http`
- `ssl-certificate-management`: 路由注册改为条件性，受 `ssl_cert` feature 控制
- `stream-proxy-management`: TCP 代理与 DNS UDP 代理彻底分离——API 路径、前端页面、前端路由均独立；`stream_proxy` 仅控制 TCP 代理
- `dns-query-management`: 路由注册改为条件性，受 `dns_proxy_http` feature 控制

## Impact

- **后端**: `app/core/features.py` — `KNOWN_FEATURES` 新增三个名称；`app/api/v1/__init__.py` — `feature_routers` 新增 `ssl_cert`、`dns_proxy_udp`、`dns_proxy_http` 条目；`app/api/v1/cluster_ssl.py` — 路由从 `api_router` 移至 `feature_routers`；**新增** `app/api/v1/cluster_dns_proxies.py` — DNS UDP 代理独立路由；`app/api/v1/cluster_stream_proxies.py` — 精简为仅 TCP 代理
- **前端**: **新增** `views/DnsUdpProxyList.vue`、`api/dnsProxy.ts`；`router/index.ts` — `featureRouteMap` 新增 `ssl_cert`、`dns_proxy_udp`、`dns_proxy_http` 记录；`AppSidebar.vue` — 三个菜单项增加 `feature` 字段，DNS代理[UDP] 路径改为 `/dns-proxies`
- **配置**: `backend/features.yaml` — 添加新 feature 默认值；`product/features.yaml` — 同步更新
- **文档**: `docs/design/features-config.md` — 补充新 feature 说明
- **数据库**: 无变更
