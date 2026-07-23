## 1. 后端：注册 dns_upstream 为内置插件

- [x] 1.1 `plugin_definitions.py`: 添加 `dns_upstream` 插件条目（category: `process`，schema: `{}`，enable_metadata: `false`）
- [x] 1.2 `features.yaml`: 在 `enabled_plugins` 中添加 `dns_upstream`
- [x] 1.3 验证 `GET /plugins/builtin` 返回 `dns_upstream`

## 2. 后端：列表 API 返回插件 config 信息

- [x] 2.1 `backend/app/api/v1/routes.py`: 修改 list_all_routes，RoutePlugin 查询同时返回 config 内容
- [x] 2.2 验证 `GET /routes?plugin=dns_upstream` 返回结果中包含 plugin config

## 3. 前端：DNS 查询列表页（卡片式）

- [x] 3.1 新建 `frontend/src/views/DnsQueryList.vue` — 卡片式列表页（参考 `StreamProxyList.vue` 的 DNS 代理卡片模式）
- [x] 3.2 每张卡片展示：集群名、DNS 标签、路由名称、URI、域名映射列表（算法/TTL/节点）、发布状态
- [x] 3.3 支持搜索、集群过滤、分组过滤
- [x] 3.4 操作按钮：编辑、发布、版本管理、删除
- [x] 3.5 PageHeader 标题为「DNS 查询」

## 4. 前端：DNS 查询表单（新建/编辑）

- [x] 4.1 新建 `frontend/src/components/DnsQueryFormModal.vue`
- [x] 4.2 基础配置字段：名称、URI（默认 `/dns-query`）、集群（下拉）、描述、状态
- [x] 4.3 域名编辑器：域名列表（可增删），每个域名展开面板配置
- [x] 4.4 每个域名下的节点表格：IP:Port 输入 + 客户端 CIDR 标签输入（动态行，可增删）
- [x] 4.5 每个域名的算法下拉选择（roundrobin/chash/ewma/least_conn），默认 roundrobin
- [x] 4.6 每个域名的 TTL 数字输入（可选）
- [x] 4.7 每个域名的健康检查折叠面板：active（对象）、passive（对象）、type（文本）
- [x] 4.8 校验：名称必填、URI 格式、至少一个域名、域名不能空、至少一个节点
- [x] 4.9 保存时调用 `POST /routes`（不带 upstream_id）+ `PUT /routes/{id}/plugins` 写入 dns_upstream
- [x] 4.10 编辑时通过 `GET /routes/{id}/plugins` 加载 dns_upstream 配置并还原到表单

## 5. 前端：路由和导航

- [x] 5.1 `router/index.ts`: 在 coreRoutes 中添加 `/dns-queries` 路由（children 中）
- [x] 5.2 `DefaultLayout.vue`: 在 `pageNameMap` 和 `sectionMap` 中添加 DnsQueryList 条目
- [x] 5.3 `AppSidebar.vue`: 在「边缘网络」section 添加「DNS 查询」菜单项，放在 DNS 代理上方
- [x] 5.4 `AppSidebar.vue`: `isActive` 函数增加 DnsQueryList 路由匹配

## 6. 后端：发布时 Edge 侧 upstream 兼容处理

- [x] 6.1 确认 Edge 的 Route API 需要 upstream 字段（用户示例中包含 dummy upstream）
- [x] 6.2 `edge_client.py` 的 `convert_route_to_edge_format` 中，当 `upstream_id` 为 null 但有 `dns_upstream` 插件时，自动填充保底值 `{"nodes": {"127.0.0.1:1": 1}}`

## 7. 前端：路由管理页面的 DNS 标识与保护

- [x] 7.1 `RouteList.vue`: 在路由表格中，对 plugins 包含 `dns_upstream` 的路由显示「DNS」标签
- [x] 7.2 `RouteList.vue`: 对 DNS 查询路由的编辑按钮替换为提示"请在 DNS 查询页面管理"

## 8. 集成与验证

- [x] 8.1 端到端测试：28 个自动化测试全部通过
- [x] 8.2 RouteList DNS 标签和编辑保护通过测试验证
- [x] 8.3 `convert_route_to_edge_format` 单元测试验证 publish payload 正确
