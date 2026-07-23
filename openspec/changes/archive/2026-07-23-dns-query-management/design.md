## Context

当前 `dns_upstream` 插件已用于 Stream 层的 UDP DNS 代理，但 HTTP 层的 DNS 查询路由缺少独立管理入口。用户需要创建 HTTP 路由，使用 `dns_upstream` 插件处理 DNS-over-HTTPS 或 HTTP 层面的 DNS 解析请求。

Stream DNS 代理走的是独立管理页面（四层代理 → DNS 代理），管理体验良好。本设计沿袭同一思路，为 HTTP 层的 DNS 查询路由建立独立管理页面，底层复用 Route + RoutePlugin 模型。

## Goals / Non-Goals

**Goals:**
- 侧边栏新增「DNS 查询」独立菜单项
- 独立列表视图，展示所有启用了 `dns_upstream` 插件的 HTTP 路由
- 专用新建/编辑表单，针对 `dns_upstream.hosts` 结构（域名 → 节点/算法/TTL/健康检查）提供字段级编辑
- 支持删除、发布、版本管理（复用现有机制）
- 后端将 `dns_upstream` 注册为正规内置插件

**Non-Goals:**
- 不覆盖 Stream 层的 UDP DNS 代理（已有独立页面）
- 不做 `dns_upstream` 与其他插件在路由层面的组合编辑
- 不支持路由关联插件组（plugin_config_ids）
- 不实现 `enable_metadata` 全局默认配置
- 不改动 Route 的数据模型 — 插件数据仍存 RoutePlugin 表

## Decisions

### 1. 独立页面 vs 插件化集成
**决策：** 独立页面，底层复用 Route + RoutePlugin 模型。
- **理由：** `dns_upstream.hosts` 配置结构复杂（动态域名 key、嵌套对象），不适合通用表单编辑器。独立页面可提供域名级表格编辑器，用户体验最优。
- **替代方案：** 注册为普通插件 + JSON 编辑器 — 被否决，因为 hosts 结构过于复杂，手写 JSON 易出错。

### 2. 数据存储策略
**决策：** 复用 Route + RoutePlugin(dns_upstream) 模型。DNS 查询页面的 CRUD 最终映射到 Route 的 API。
- **理由：** Edge 原生支持 `route.plugins.dns_upstream`，复用此模型可零额外转换直接发布，兼容性最好。
- **实现：** 前端表单构建 `{ hosts: { ... } }` 作为 `dns_upstream` 插件的 config，通过 `PUT /clusters/{id}/routes/{id}/plugins` 保存。
- **替代方案：** 独立 DB 表 + 发布时转换为 Edge 格式 — 被否决，增加维护成本且脱离 Edge 原生模型。

### 3. 列表数据源
**决策：** 调用 `GET /routes?plugin=dns_upstream`，后端按 RoutePlugin 表过滤。
- **理由：** 后端 routes API 已有 `plugin` 查询参数，可按插件名称过滤路由。
- **替代方案：** 新增独立 API 端点 — 被否决，増加不必要的 API 膨胀。

### 4. 注册为内置插件
**决策：** 在 `plugin_definitions.py` 添加 `dns_upstream`，`enable_metadata: false`，`schema: {}`（空 schema 强制使用 JSON 编辑器，但用户通过独立页面管理，不需用到通用 PluginEditor）。在 `features.yaml` 添加 `dns_upstream` 到 `enabled_plugins`。
- **理由：** 确保平台一致性；插件管理后台可识别此插件。
- **不启用 metadata**：因为全局默认 hosts 的需求目前不明确，避免增加无用的配置复杂度。

### 5. upstream_id 处理
**决策：** DNS 查询路由的 `upstream_id` 设置为 null（数据库已有 `nullable=True` 支持，Pydantic schema 已有 `Optional[int]`）。
- **理由：** `dns_upstream` 插件自身处理域名解析和转发，路由不需要标准上游。
- **影响：** 前端 DnsQueryFormModal 不需要上游选择字段，保存时不传 `upstream_id`。

### 6. 插件组（plugin_config_ids）
**决策：** DNS 查询路由不关联任何插件组，保持简单。
- **理由：** `dns_upstream` 是独立功能，混入其他插件组可能导致配置冲突和难以排查的问题。

### 7. 列表卡片域名摘要
**决策：** 修改后端 `routes.py` 列表 API，当 `plugin=dns_upstream` 查询时，返回的 `plugins` 列表包含 config 信息（`{"plugin_name": "dns_upstream", "config": {...}}`），供前端卡片展示域名映射摘要。
- **理由：** 避免 N+1 查询，一次 API 调用即可拿到卡片所需全部数据。
- **替代方案：** 每条路由额外调用 `GET /routes/{id}/plugins` — 被否决，性能差。

### 8. 菜单位置
**决策：** 侧边栏「DNS 查询」放在「边缘网络」section，DNS 代理上方。
- **理由：** 与 Stream DNS 代理功能上最相关，用户在同一区域查找。

### 9. 路由管理页面中 DNS 路由的处理
**决策：** RouteList 中 DNS 查询路由显示「DNS」标签，且编辑按钮禁用并弹出提示"请在 DNS 查询页面管理此路由"。
- **理由：** 防止用户在通用路由表单中误操作 DNS 查询路由（例如修改 URI 导致 DNS 服务不可用）。

## Risks / Trade-offs

- **[体验 vs 维护成本]** 独立页面提供最佳体验，但需要单独维护一套针对 `dns_upstream` 配置结构的表单组件。若后续新增类似的复杂配置插件，需再次建独立页面 — 应在架构上预留「特殊路由类型」的扩展点。
- **[路由管理中的只读策略]** RouteList 中禁用 DNS 路由的编辑，但用户仍可通过 API 直接修改。这是一条软防线，无法完全阻止技术用户绕过。**缓解措施**：提示信息清晰说明管理入口。
- **[空 schema 的副作用]** `dns_upstream` schema 为空 {}，在 PluginSelector 中点击编辑会直接进入空白 JSON 编辑器。**缓解措施**：独立页面提供专用表单，用户无需进入路由的插件编辑器操作 dns_upstream。
- **[Edge 发布时 upstream 缺失]** 发布 DNS 查询路由时，Edge 侧 Route API 可能需要 `upstream` 字段。如果 `upstream_id` 为空，发布到 Edge 时需要确认 Edge 是否接受无 upstream 的路由。**缓解措施**：发布时如需上游，考虑自动填充一个保底 upstream（如 `127.0.0.1:1`）。
