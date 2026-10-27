# dns-query-management Specification

## Purpose

HTTP 层的 DNS 代理路由独立管理功能，提供专用卡片列表视图和表单，管理启用了 `dns_upstream` 插件的 HTTP 路由。
## Requirements
### Requirement: DNS 代理独立列表视图（卡片式）

系统 SHALL 提供独立的 DNS 代理列表页面（`/dns-queries`），以卡片形式展示所有启用了 `dns_upstream` 插件的 HTTP 路由。该页面 SHALL 受 `dns_proxy_http` 部署特性控制。卡片 SHALL 以路由名称为主身份展示；URI SHALL 降级至详情区并附带入口路径解释；全页实体叫法 SHALL 统一为「DNS 代理路由」。

#### Scenario: 列表加载
- **WHEN** `dns_proxy_http` feature 为 `true`
- **AND** 用户点击侧边栏「DNS代理[HTTP]」
- **THEN** 页面 SHALL 调用 `GET /api/v1/routes?plugin=dns_upstream`
- **AND** 每张卡片 SHALL 展示：名称（顶栏主身份）、DNS 标签、所属集群、URI（详情区，mono 弱色 + 入口路径解释）、域名映射列表（每个域名显示算法/健康检查类型（规范化显示，如 HTTPS）/TTL/上游 IP:Port 列表）与域名计数、发布状态/版本
- **AND** PageHeader 标题显示「DNS 代理（HTTP）」，description 说明基于 dns_upstream 插件实现域名解析转发
- **AND** 页面全部实体叫法 SHALL 为「DNS 代理路由」（页头按钮、搜索占位、计数、空态、弹窗标题、toast、删除/发布确认），MUST NOT 再出现「DNS 查询」旧叫法

#### Scenario: 功能禁用时隐藏
- **WHEN** `dns_proxy_http` feature 为 `false`
- **THEN** 侧边栏「DNS代理[HTTP]」菜单项 SHALL NOT 显示
- **AND** `/dns-queries` 路由 SHALL NOT 注册
- **AND** 用户直接访问 `/dns-queries` SHALL 显示 404

#### Scenario: 负载均衡算法显示完整
- **WHEN** 卡片或查看弹窗渲染域名配置
- **THEN** 负载均衡算法 SHALL 显示中文标签，`ewma` SHALL 显示为「EWMA」，MUST NOT 显示未映射的原始值

### Requirement: DNS 代理路由创建

系统 SHALL 提供专用的 DNS 代理路由创建表单：健康检查 SHALL 半结构化编辑（类型下拉 + 主动/被动折叠 JSON 区，校验失败阻止提交）；校验错误 SHALL 跨 Tab 可见可到达；创建 SHALL 原子——插件配置保存失败时 SHALL 补偿回滚已创建的路由。

#### Scenario: 基本配置
- **WHEN** 用户点击「新建 DNS 代理路由」按钮
- **THEN** 表单 SHALL 包含以下字段：
  - 名称（文本，必填）
  - 所属集群（下拉，必填）
  - URI（文本，独占一行，默认 `/dns-query`，可修改，附「DoH 请求入口路径」解释）
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
- **AND** 每个域名 SHALL 配置 DNS 上游服务器列表（动态表格，术语 SHALL 为「DNS 上游服务器/N 个上游」，MUST NOT 使用与平台节点混淆的「节点」）：
  - 上游 IP 地址（文本，独立输入框，`@input` 实时验证格式）
  - 上游端口（数字输入，最小 1 最大 65535，`@input` 实时验证）
  - 客户端 CIDR 列表（可选，逗号分隔）
- **AND** 每个域名 SHALL 配置负载均衡算法（下拉选择，默认 `roundrobin`，选项：`roundrobin`/`chash`/`ewma`/`least_conn`）
- **AND** 每个域名 SHALL 配置 TTL（数字输入，单位秒，可选）

#### Scenario: 健康检查半结构化编辑
- **GIVEN** 用户勾选某域名的「健康检查」
- **WHEN** 展开健康检查配置
- **THEN** SHALL 提供类型下拉（http/https，默认 https）
- **AND** 主动检查（active）与被动检查（passive）SHALL 各为可折叠高级区（默认收起），区内 JSON 文本提交前 SHALL 校验
- **AND** 任一 JSON 解析失败 SHALL 阻止提交并在对应输入框下显示中文错误（含失败原因），MUST NOT 静默替换用户输入

#### Scenario: 校验错误跨 Tab 可见
- **WHEN** 用户提交时任一 Tab 存在校验错误
- **THEN** 表单 SHALL 自动切换到第一个含错 Tab
- **AND** 含错 Tab 的页签 SHALL 显示错误数角标（如「域名配置 ●3」）
- **AND** 弹窗 SHALL 展示汇总提示（如「还有 3 项问题在『域名配置』」；单 Tab 有错时可不显示汇总）

#### Scenario: 创建原子性（失败回滚）
- **WHEN** 路由创建成功（POST）但插件配置保存（PUT plugins）失败
- **THEN** 系统 SHALL 自动调用 DELETE 删除已创建的路由（补偿回滚）
- **AND** 错误提示 SHALL 说明「保存失败：路由已回滚」及失败原因
- **AND** 补偿删除自身失败时 SHALL 追加提示残留路由名称，提醒手动删除

#### Scenario: 保存 DNS 代理路由
- **WHEN** 用户填写完成并点击保存
- **THEN** 系统 SHALL 调用 `POST /api/v1/clusters/{cluster_id}/routes` 创建路由（不带 `upstream_id`）
- **AND** 系统 SHALL 调用 `PUT /api/v1/clusters/{cluster_id}/routes/{route_id}/plugins` 保存 `dns_upstream` 插件配置
- **AND** 底层存储为 RoutePlugin(dns_upstream) 格式
- **AND** 不关联任何 plugin_config_ids

### Requirement: DNS 代理路由编辑

系统 SHALL 支持编辑已有的 DNS 代理路由，还原已保存的配置到表单各字段；编辑 SHALL 分步如实报告部分成功状态。

#### Scenario: 编辑加载
- **WHEN** 用户点击编辑 DNS 代理路由
- **THEN** 系统 SHALL 从 RoutePlugin 加载 `dns_upstream` 插件数据
- **AND** 将 hosts 配置还原到表单的域名/DNS 上游服务器/算法/TTL/健康检查各字段
- **AND** 至少第一个域名 SHALL 默认展开，MUST NOT 全部折叠

#### Scenario: 编辑部分成功如实报告
- **WHEN** 路由基础信息保存（PUT route）成功但插件配置保存（PUT plugins）失败
- **THEN** 系统 SHALL NOT 回滚基础信息
- **AND** 提示 SHALL 说明「路由基础信息已保存，但域名配置保存失败：{原因}」并提供「重试保存域名配置」动作

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

### Requirement: 查看详情快捷编辑

查看弹窗 SHALL 提供「编辑」快捷入口，从查看态一次点击进入编辑，MUST NOT 要求先关闭弹窗再点卡片编辑。

#### Scenario: 查看 → 编辑
- **WHEN** 用户在查看弹窗点击「编辑」
- **THEN** 查看 SHALL 关闭且编辑弹窗 SHALL 打开同一路由

