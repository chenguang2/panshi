## ADDED Requirements

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

#### Scenario: 列表接口
- **WHEN** `GET /edge-client/nodes/{ip}/{port}/stream-routes` 被调用
- **THEN** 系统 SHALL 调用 `client.api("stream_route", "list")` 并返回 `{"stream_routes": [...]}`
