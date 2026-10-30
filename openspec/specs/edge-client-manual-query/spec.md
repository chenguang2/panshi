# edge-client-manual-query Specification

## Purpose
TBD - created by archiving change fix-edge-client-blocking. Update Purpose after archive.

## Requirements

### Requirement: Manual query trigger

选择节点 SHALL 立即自动查询（2026-10-30 修正漂移：原「SHALL NOT auto-load」与现状不符——选节点即触发全量并行查询是现行主路径，本场景标题按稳定标识符保留、正文反转裁决见 proposal）；「查询」按钮保留用于手动刷新与手动输入模式提交。未选择/未输入节点时点击查询 SHALL 提示「请先选择节点」而非静默返回。手动输入 SHALL 直接读取输入框当前值提交，SHALL NOT 依赖失焦事件更新中间状态。

<!-- 2026-10-30 edge-client-ux-review-fixes：行为反转（选节点即自动查询），场景标题按稳定标识符保留 -->

#### Scenario: Page loads without auto query
- **WHEN** the user navigates to the edge client page
- **THEN** the cluster list SHALL load for the dropdown selector
- **AND** node data SHALL NOT be loaded automatically（进页不自动查询——仅选择节点后自动查询）
- **AND** the "查询" button SHALL be enabled

#### Scenario: 选择节点自动查询
- **WHEN** 用户在集群模式下选择边缘节点
- **THEN** 系统 SHALL 立即自动发起该节点的全量并行查询

#### Scenario: 查询按钮手动刷新
- **WHEN** 用户点击「查询」按钮
- **THEN** 系统 SHALL 以当前选中/输入的节点重新发起全量查询（手动刷新语义）

#### Scenario: 未选节点提示
- **WHEN** 未选择或未输入节点时点击「查询」
- **THEN** SHALL 显示提示「请先选择节点」，不发起请求

#### Scenario: 手动输入直读
- **WHEN** 用户在手动输入模式输入地址后直接点击「查询」（不经历失焦）
- **THEN** 查询 SHALL 使用输入框当前值

### Requirement: SSL 证书 Tab

Edge 直连页面 SHALL 在 Tab 栏中提供 SSL 证书 Tab，结构与其他资源 Tab 一致：表格列含名称、SNI 域名、类型、状态，支持搜索筛选与分页，每行提供 JSON 查看、删除操作，上方提供刷新按钮。

#### Scenario: SSL Tab 展示
- **WHEN** 用户切换到 Edge 直连页面的 SSL 证书 Tab
- **THEN** Tab 内 SHALL 显示证书列表表格
- **AND** 表格列 SHALL 包含：名称、SNI 域名、类型、状态
- **AND** 支持搜索筛选与分页

#### Scenario: SSL 操作按钮
- **WHEN** 用户在 SSL Tab 中
- **THEN** 每行 SHALL 显示操作按钮（JSON 查看、删除）
- **AND** 上方 SHALL 有刷新按钮

#### Scenario: Click query loads data
- **WHEN** the user selects a cluster and node（或手动输入后点击查询）
- **THEN** 8 parallel requests SHALL be sent to load upstreams, routes, global rules, plugin configs, plugin metadata, plugin list, stream routes, and SSL certificates
- **AND** 各路结果 SHALL 聚合反馈：全部失败时不显示「已连接」并展示错误横幅；部分失败时展示 warning 横幅列出失败类别（2026-10-30 edge-client-ux-review-fixes：6 路 → 8 路 + 聚合反馈）

### Requirement: Cancel query

The edge client page SHALL provide a "取消查询" button to abort in-flight requests.

#### Scenario: Cancel button enabled during query
- **WHEN** a query is in progress
- **THEN** the "取消查询" button SHALL be enabled

#### Scenario: Cancel aborts requests
- **WHEN** the user clicks "取消查询"
- **THEN** all in-flight requests SHALL be aborted immediately
- **AND** the "取消查询" button SHALL become disabled
- **AND** the "查询" button SHALL become enabled

### Requirement: Backend non-blocking edge requests

The backend SHALL execute synchronous EdgeClient calls in a thread pool to avoid blocking the asyncio event loop.

#### Scenario: Concurrent edge requests don't block the server
- **WHEN** 6 parallel edge client requests are sent
- **AND** one or more edge nodes are unreachable
- **THEN** other API endpoints (e.g., cluster management) SHALL remain responsive
- **AND** each request SHALL timeout individually after 5 seconds

#### Scenario: Client disconnect cancels the task
- **WHEN** the client disconnects during an edge request
- **THEN** FastAPI SHALL cancel the asyncio task
- **AND** the thread pool thread SHALL complete without blocking the event loop

### Requirement: Edge 直连功能受特性配置控制

Edge 直连页面 SHALL 受 `features.yaml` 中 `edge_client` 特性控制。

#### Scenario: Edge 直连启用
- **WHEN** `features.yaml` 中 `edge_client` 为 `true`
- **THEN** `/edge-client` 路由 SHALL 注册
- **AND** 侧边栏 Edge 直连菜单项 SHALL 显示
- **AND** 后端 `GET /api/v1/edge-client/nodes` SHALL 可用（返回 200）

#### Scenario: Edge 直连禁用
- **WHEN** `features.yaml` 中 `edge_client` 为 `false`
- **THEN** `/edge-client` 路由 SHALL NOT 注册（访问返回 404）
- **AND** 侧边栏 Edge 直连菜单项 SHALL NOT 显示
- **AND** 后端所有 `/api/v1/edge-client/*` 端点 SHALL 返回 404
- **AND** 用户无法通过 URL 直接访问该功能

### Requirement: 查询失败聚合反馈

全部 8 路请求失败时 SHALL NOT 显示「已连接」状态，SHALL 展示错误横幅「节点不可达或端口错误（ip:port），请检查后重试」；部分失败时成功类别正常展示并 SHALL 展示 warning 横幅列出失败类别名称。

#### Scenario: 全部失败
- **WHEN** 8 路请求全部失败（节点不可达/端口错误）
- **THEN** SHALL NOT 显示「已连接」状态
- **AND** SHALL 展示错误横幅「节点不可达或端口错误（ip:port），请检查后重试」

#### Scenario: 部分失败
- **WHEN** 部分类别获取失败（如 SSL 证书接口异常）其余成功
- **THEN** 成功类别 SHALL 正常展示
- **AND** SHALL 展示 warning 横幅列出失败类别名称

### Requirement: 观感一致性

各资源 Tab 保持全量渲染（2026-10-30 用户裁决 B：调试场景需整表浏览，不接入分页）；搜索框图标 SHALL 使用 AntD SearchOutlined 组件（替换 emoji 字符）；手动输入 placeholder SHALL 使用本环境真实网段示例。

#### Scenario: 搜索图标
- **WHEN** 用户查看任一搜索框
- **THEN** 图标 SHALL 为 SearchOutlined 而非 emoji 字符

#### Scenario: 手动输入示例
- **WHEN** 用户切换到手动输入模式
- **THEN** placeholder SHALL 为本环境真实格式的示例地址（如 192.168.0.14:16620）

### Requirement: 编辑弹窗绕过警示

各资源编辑/新建弹窗 SHALL 在顶部展示 info 提示「调试模式：修改将直接写入边缘节点，绕过平台同步流程」，删除确认保持既有 danger 确认不变。

#### Scenario: 编辑弹窗警示
- **WHEN** 用户打开任一编辑/新建弹窗
- **THEN** 弹窗顶部 SHALL 显示绕过同步流程的调试模式提示
