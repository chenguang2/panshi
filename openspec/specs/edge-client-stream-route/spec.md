## Purpose

Edge 直连页「四层代理」Tab 的能力：查看节点上的 Stream Route 列表、搜索过滤、查看 JSON、删除，
以及平台的 5 个 Stream Route 代理接口（含写载荷前置校验）。

## Requirements

### Requirement: Edge 直连支持 Stream Route 列表查看
系统 SHALL 在 Edge 直连页面新增「四层代理」Tab，展示当前 Edge 节点上的所有 Stream Route。

#### Scenario: Tab 页展示
- **WHEN** 用户在 Edge 直连页面选择节点后点击「查询」
- **THEN** 「四层代理」Tab SHALL 显示在「插件列表」Tab 之后、「SSL 证书」Tab 之前
- **AND** 列表列定义 SHALL 包含：序号、ID、名称、server_port、协议、server_addr、remote_addr、SNI、上游节点数、操作

#### Scenario: 数据加载
- **WHEN** 用户点击「查询」按钮
- **THEN** 系统 SHALL 在 `loadAllData()` 的 `Promise.all` 中并行调用 `loadStreamRoutes(ip, port)`
- **AND** 切换 Tab 时通过 `loadData()` 的 `switch` 按需重新加载

### Requirement: 支持搜索过滤
系统 SHALL 在「四层代理」Tab 提供搜索输入框，按名称或描述过滤。

#### Scenario: 搜索过滤
- **WHEN** 用户在搜索框输入关键字
- **THEN** 列表 SHALL 仅显示 name 或 id 包含关键字的 Stream Route

### Requirement: 支持 JSON 查看
系统 SHALL 支持查看 Stream Route 的完整 JSON 配置。

#### Scenario: 查看 JSON
- **WHEN** 用户点击 Stream Route 行的「JSON」按钮
- **THEN** 系统 SHALL 打开弹窗展示该 Stream Route 的完整 JSON 数据

### Requirement: 支持删除 Stream Route
系统 SHALL 支持从 Edge 节点删除 Stream Route。

#### Scenario: 删除确认
- **WHEN** 用户点击「删除」按钮
- **THEN** 系统 SHALL 弹出确认对话框
- **AND** 确认后调用 `DELETE /edge-client/nodes/{ip}/{port}/stream-routes/{id}`

### Requirement: 后端代理接口
系统 SHALL 提供 5 个 Stream Route 的代理接口，通过 EdgeClient 调用 Edge 节点 API。

由于 Edge 的创建接口不校验载荷（实测对空载荷 `{}` 亦返回 200 并在节点上创建出既无 `server_port` 也无 `upstream` 的路由），平台 SHALL 在转发前校验写载荷，非法载荷 SHALL 被直接拒绝且不得触达 Edge 节点。

#### Scenario: 列表接口

- **WHEN** `GET /edge-client/nodes/{ip}/{port}/stream-routes` 被调用
- **THEN** 系统 SHALL 调用 `client.api("stream_route", "list")` 并返回 `{"stream_routes": [...]}`

#### Scenario: 创建接口

- **WHEN** `POST /edge-client/nodes/{ip}/{port}/stream-routes` 被调用且载荷合法
- **THEN** 系统 SHALL 调用 `client.api("stream_route", "create", <载荷>)`（即 `POST /stream/edge/admin/routes`），由 Edge 节点分配该路由的 id

#### Scenario: 创建载荷非法被平台拦截

- **WHEN** 创建请求缺少 `server_port`、`server_port` 超出 1–65535，或 `upstream.nodes` 为空
- **THEN** 系统 SHALL 返回 4xx 校验错误
- **AND** SHALL NOT 向 Edge 节点发起任何请求（节点上不得因此新增路由）

#### Scenario: 更新接口

- **WHEN** `PUT /edge-client/nodes/{ip}/{port}/stream-routes/{route_id}` 被调用
- **THEN** 系统 SHALL 调用 `client.api("stream_route", "update", route_id, <载荷>)`，路径 id 与请求中的 id 一致
