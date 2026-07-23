# dns-query-management Specification

## Purpose

HTTP 层的 DNS 代理路由独立管理功能，提供专用卡片列表视图和表单，管理启用了 `dns_upstream` 插件的 HTTP 路由。

## Requirements

### Requirement: DNS 代理独立列表视图（卡片式）
系统 SHALL 提供独立的 DNS 代理列表页面，以卡片形式展示所有启用了 `dns_upstream` 插件的 HTTP 路由。卡片布局参考 StreamProxyList 的 DNS 代理卡片风格。

#### Scenario: 列表加载
- **WHEN** 用户点击侧边栏「DNS代理[HTTP]」
- **THEN** 页面 SHALL 调用 `GET /api/v1/routes?plugin=dns_upstream`
- **AND** 每张卡片 SHALL 展示：URI（顶栏）、DNS 标签、路由名称、所属集群、域名映射列表（每个域名显示算法/TTL/健康检查类型/IP:Port 列表）、发布状态/版本
- **AND** PageHeader 标题显示「DNS 查询」

#### Scenario: 卡片域名信息展示
- **WHEN** 卡片渲染时
- **THEN** 每个域名 SHALL 显示为独立区块
- **AND** 域名区块内 SHALL 展示：域名（mono 字体）、负载均衡算法标签、TTL（如有）、健康检查类型标签（如有）、节点 IP:Port 标签列表

### Requirement: DNS 代理路由创建
系统 SHALL 提供专用的 DNS 代理路由创建表单。

#### Scenario: 基本配置
- **WHEN** 用户点击「新建 DNS 查询」按钮
- **THEN** 表单 SHALL 包含以下字段：
  - 名称（文本，必填）
  - 所属集群（下拉，必填）
  - URI（文本，独占一行，默认 `/dns-query`，可修改）
  - 描述（文本，可选）
  - 状态（启用/禁用）
- **AND** 表单 SHALL 不包含「上游」选择字段（`upstream_id` 不传或传 null）
- **AND** 表单 SHALL 不包含「插件组」选择

#### Scenario: 域名解析配置
- **WHEN** 用户在创建表单中配置域名解析规则
- **THEN** 用户 SHALL 可添加一个或多个域名
- **AND** 每个域名 SHALL 与负载均衡算法下拉、TTL 输入放在同一行
- **AND** 每个域名 SHALL 配置：
  - 域名（文本，必填，例如 `qcg.com`，`@input` 实时验证）
- **AND** 每个域名 SHALL 配置节点列表（动态表格）：
  - IP 地址（文本，独立输入框，`@input` 实时验证格式）
  - 端口（数字输入，最小 1 最大 65535，`@input` 实时验证）
  - 客户端 CIDR 列表（可选，逗号分隔）
- **AND** 每个域名 SHALL 配置负载均衡算法（下拉选择，默认 `roundrobin`，选项：`roundrobin`/`chash`/`ewma`/`least_conn`）
- **AND** 每个域名 SHALL 配置 TTL（数字输入，单位秒，可选）
- **AND** 每个域名 SHALL 配置健康检查（checkbox 开关 + 单 JSON 文本框，默认开启，默认值 `{"type":"https","active":{},"passive":{}}`）

#### Scenario: 保存 DNS 代理路由
- **WHEN** 用户填写完成并点击保存
- **THEN** 系统 SHALL 调用 `POST /api/v1/clusters/{cluster_id}/routes` 创建路由（不带 `upstream_id`）
- **AND** 系统 SHALL 调用 `PUT /api/v1/clusters/{cluster_id}/routes/{route_id}/plugins` 保存 `dns_upstream` 插件配置
- **AND** 底层存储为 RoutePlugin(dns_upstream) 格式
- **AND** 不关联任何 plugin_config_ids

### Requirement: DNS 代理路由编辑
系统 SHALL 支持编辑已有的 DNS 代理路由，还原已保存的配置到表单各字段。

#### Scenario: 编辑加载
- **WHEN** 用户点击编辑 DNS 代理路由
- **THEN** 系统 SHALL 从 RoutePlugin 加载 `dns_upstream` 插件数据
- **AND** 将 hosts 配置还原到表单的域名/节点/算法/TTL/健康检查各字段

### Requirement: DNS 代理路由删除
系统 SHALL 支持删除 DNS 代理路由，删除时清理对应的插件配置。

#### Scenario: 删除路由
- **WHEN** 用户点击删除 DNS 代理路由
- **THEN** 系统 SHALL 调用 `DELETE /api/v1/clusters/{cluster_id}/routes/{route_id}`
- **AND** 该路由关联的 RoutePlugin 数据一并删除

### Requirement: DNS 代理路由发布
系统 SHALL 支持将 DNS 代理路由发布到 Edge 节点，复用现有发布机制。

#### Scenario: 发布
- **WHEN** 用户点击发布 DNS 代理路由
- **THEN** 系统 SHALL 使用 `executePublish` 函数将路由 + `dns_upstream` 插件发布到 Edge
- **AND** Edge 侧收到标准的 `route + plugins.dns_upstream` 配置
- **AND** 发布时如 `upstream_id` 为空，`convert_route_to_edge_format` 自动填充保底值 `{"nodes": {"127.0.0.1:1": 1}}`

### Requirement: 路由管理页面的 DNS 标识与保护
系统 SHALL 在路由管理页面中标识已启用 `dns_upstream` 插件的路由，并阻止在通用路由表单中操作。

#### Scenario: 路由列表标签
- **WHEN** RouteList 中某条路由启用了 `dns_upstream` 插件
- **THEN** 该路由行 SHALL 显示「DNS」标签
- **AND** 插件过滤器中 SHALL 包含 `dns_upstream`

#### Scenario: 禁止通用操作
- **WHEN** 用户在 RouteList 中点击 DNS 代理路由的操作按钮
- **THEN** 系统 SHALL 弹出提示"这是一条 DNS 查询路由，请在 DNS 查询页面管理"
- **AND** 不弹出操作下拉菜单

### Requirement: 查看详情
系统 SHALL 支持通过「查看」按钮打开详情弹窗，展示路由和 DNS 配置的完整信息。

#### Scenario: 查看弹窗
- **WHEN** 用户点击卡片上的「查看」按钮
- **THEN** 系统 SHALL 弹出模态框
- **AND** 展示：名称、URI、集群、描述、状态/版本
- **AND** 展示 DNS 配置详情：域名、算法、TTL、健康检查类型、节点 IP:Port 及 CIDR
