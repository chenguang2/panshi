## Why

当前 `dns_upstream` 插件已用于 Stream 代理（UDP DNS 代理）的智能 DNS 解析。用户需要在 HTTP 路由层面也支持同样的 DNS 上游解析能力——即创建一条 HTTP 路由，收到 DNS 查询请求时，通过 `dns_upstream` 插件进行域名解析和负载调度。

如果只是将 `dns_upstream` 作为一个普通插件加入路由的「插件管理」，其 `hosts` 配置结构复杂（动态域名 key、嵌套节点/算法/健康检查），不适合通用表单编辑，用户必须手写 JSON，易出错且体验差。

因此需要一个**独立的 DNS 查询管理页面**，类似 Stream DNS 代理的管理方式，为 HTTP 层的 DNS 上游解析提供专用表单和独立管理视图。

## What Changes

- **新增「DNS 查询」管理页面** — 侧边栏新增独立菜单项，类似「四层代理」中 DNS 代理的独立管理
- **专用 CRUD 表单** — 针对 `dns_upstream` 的 `hosts` 结构设计专用表单（域名管理、节点列表、算法、TTL、健康检查等字段）
- **底层复用 Route + `dns_upstream` 插件模型** — 独立 UI，共享存储，与 Edge API 兼容
- **后端注册 `dns_upstream` 为内置插件** — 加入 `BUILTIN_PLUGINS` 和 `features.yaml`，支持插件元数据（全局默认 hosts）
- **DNS 查询路由的发布/版本管理** — 复用现有的发布流程和版本管理机制

## Capabilities

### New Capabilities
- `dns-query-management`: 独立 DNS 查询管理页面，包含列表、新建、编辑、删除、发布、版本管理功能

### Modified Capabilities
- `route-management`: 路由列表和详情中需要标识 DNS 查询类型的路由（标记或过滤）

## Impact

- **新页面**：`frontend/src/views/DnsQueryList.vue` — 卡片式列表页（参考 StreamProxyList DNS 模式）
- **新组件**：`frontend/src/components/DnsQueryFormModal.vue` — 专用表单（域名编辑器、节点表格、健康检查）
- **后端**：
  - `plugin_definitions.py` 增加 `dns_upstream` 条目（`enable_metadata: false`）
  - `features.yaml` 添加 `dns_upstream` 到 `enabled_plugins`
  - `routes.py`（全局路由列表 API）增加返回插件 config 信息，以支持卡片展示域名摘要
- **路由**：前端新增 `/dns-queries` 路由（静态路由，非 feature-gated）
- **导航**：`AppSidebar.vue` 边缘网络 section 新增「DNS 查询」菜单项，位于 DNS 代理上方
- **RouteList.vue**：DNS 查询路由显示 DNS 标签，且编辑按钮禁用并提示跳转
