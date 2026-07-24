## Context

当前 `features.yaml` 支持通过 `KNOWN_FEATURES` 中定义的功能名来控制后端路由注册、前端路由注册和侧边栏菜单可见性。三个目标功能现状：

1. **SSL 证书**：后端 `cluster_ssl.router` 始终注册在 `api_router` 中（`__init__.py`），前端路由 `/ssl` 始终注册在 `coreRoutes` 中，侧边栏「SSL 证书」菜单项无 `feature` 字段
2. **DNS 代理[UDP]**：后端 TCP/DNS UDP 代理共享 `cluster_stream_proxies.router`（始终注册在 `api_router`），stream 整体由 `stream_proxy` feature 控制（在 `feature_routers` 中）。前端路由 `/stream-proxies` 通过 `featureRouteMap` 的 `stream_proxy` 控制，侧边栏「DNS代理[UDP]」菜单项有 `feature: 'stream_proxy'`
3. **DNS 代理[HTTP]**（DNS 查询）：后端无独立 API router（复用 routes API），前端路由 `/dns-queries` 始终注册在 `coreRoutes` 中，侧边栏「DNS代理[HTTP]」菜单项无 `feature` 字段

## Goals / Non-Goals

**Goals:**
- 为 SSL 证书、DNS 代理[UDP]、DNS 代理[HTTP] 三个功能分别添加独立的 feature 开关名
- 后端：三个功能的路由注册变为条件性（受 feature 控制）
- 前端：三个功能的路由动态注册，侧边栏菜单增加 feature 过滤
- 保持向后兼容：三个新 feature 默认启用
- 分离 DNS 代理[UDP] 与 TCP 代理的 feature 控制

**Non-Goals:**
- 不改动 Stream Proxy 的数据模型和业务逻辑
- 不改动 SSL 证书的数据模型和业务逻辑
- 不改动 DNS 查询（HTTP）的数据模型和业务逻辑
- 不新增数据库表或字段
- 不涉及权限系统的改动

## Decisions

### 1. Feature 命名

采用 kebab-case 风格，与现有命名一致：

| 功能 | Feature 名 | 说明 |
|---|---|---|
| SSL 证书管理 | `ssl_cert` | 独立控制 SSL 证书 CRUD/发布 |
| DNS 代理[UDP] | `dns_proxy_udp` | 从 `stream_proxy` 拆分，独立控制 UDP DNS 代理 |
| DNS 代理[HTTP] | `dns_proxy_http` | 独立控制 HTTP DNS 查询管理页面 |

### 2. 后端路由拆分策略

- **SSL 证书**：将 `cluster_ssl.router` 和 `cluster_ssl.global_router` 从 `api_router`（始终注册）移至 `feature_routers`，受 `ssl_cert` 控制
- **DNS 代理[UDP]**：从 `cluster_stream_proxies.py` 中彻底分离，新增独立路由文件 `cluster_dns_proxies.py`，路径前缀 `/clusters/{cluster_id}/dns-proxies`，受 `dns_proxy_udp` 控制
- **DNS 代理[HTTP]**：该功能无独立后端 router（复用 routes API），所以不需要后端路由变更；只需前端控制即可

#### 2a. TCP 与 DNS UDP 的彻底分离 — 方案 C1

TCP 代理和 DNS UDP 代理目前共享 `StreamProxy` 数据模型和 `cluster_stream_proxies.py` 中的同一组 handler 函数，仅通过 `proxy_type` 字段（`normal` / `dns`）区分。方案 C1 将其彻底分离：

| 维度 | TCP 代理 | DNS 代理[UDP] |
|---|---|---|
| 后端文件 | `cluster_stream_proxies.py` | `cluster_dns_proxies.py`（新增） |
| API 路径 | `/clusters/{id}/stream-proxies` | `/clusters/{id}/dns-proxies` |
| Feature 名 | `stream_proxy` | `dns_proxy_udp` |
| 数据模型 | `StreamProxy`（共用） | `StreamProxy`（共用） |
| 前端页面 | `StreamProxyList.vue` | `DnsUdpProxyList.vue`（新增） |
| 前端路径 | `/stream-proxies` | `/dns-proxies` |

**共享逻辑**：CRUD 操作逻辑基本相同，通过共享函数（如 `_create_proxy()`）避免重复代码。

**不可行方案说明**：不能通过创建两个 `APIRouter` 实例指向同一组路径模式来拆分，因为 FastAPI 不允许在同一个 app 中注册重复的路由路径模式。因此必须使用独立的路径前缀。

### 3. DNS 代理[HTTP] 无后端路由变更

DNS 查询页面复用标准 routes API（`GET /routes?plugin=dns_upstream`），该 API 属于核心路由功能，不应该被关闭。前端只需要控制页面入口（路由注册 + 侧边栏菜单）即可。

### 4. 向后兼容

三个新 feature 默认值为 `true`（在 `features.yaml` 中不写或设为 `true` 时启用），现有部署不受影响。

## Risks / Trade-offs

- **[低] DNS UDP 与 TCP 的 API 路径分离**：`/clusters/{id}/dns-proxies` 是新增路径，Edge 节点侧的 API 路径不变（Edge 不区分 TCP/DNS 代理）。这一点不影响 Edge 发布流程，只影响磐石 Admin 自身的管理 API
- **[无] SSL router 拆分风险**：`cluster_ssl.router` 和 `global_router` 在 `api_router` 中，移到 `feature_routers` 不会影响路由行为，只是注册条件变化
- **[低] DNS 代理[HTTP] 的前端控制仅限 UI 层**：用户仍然可以通过直接访问 routes API 创建带 `dns_upstream` 插件的路由。这与现有其他 feature 的行为一致（features.yaml 不提供 API 级别的硬阻断，除后端路由注册外）
- **[中] 代码重复**：TCP 和 DNS UDP 的 CRUD handler 逻辑高度相似（CRUD + 发布 + 版本历史），分离后会产生重复代码。通过在 `cluster_stream_proxies.py` 中暴露共享工具函数（如发布逻辑）给 `cluster_dns_proxies.py` 使用来缓解，不做 DRY 层面过度抽象
