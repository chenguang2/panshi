# stream-proxy-ux-review-fixes 变更规格

## MODIFIED Requirements

### Requirement: Stream proxy list shows publish status
The system SHALL display the publish status on each card using the shared `PublishStatusTag` four-state semantics (未发布 / 待发布 / 已发布 vN+时间 / ⚠ 发布未完全生效)， replacing the current binary 已发布/未发布 badge; the standalone version text SHALL NOT duplicate the state semantics.

#### Scenario: Show published status
- **WHEN** a proxy has been published and has `current_version`，且无待发布/部分生效
- **THEN** the card shows the shared tag "已发布 v{version} · {date}"（绿）

#### Scenario: Show unpublished status
- **WHEN** a proxy has no `current_version`
- **THEN** the card shows "未发布"（中性色）

#### Scenario: Show pending status after edit
- **WHEN** a published proxy has been edited (`pending_publish=true`)
- **THEN** the card shows "待发布"（橙，tooltip「配置已修改，发布后生效」）

#### Scenario: Show partial status
- **WHEN** `last_publish_status == "partial"`
- **THEN** the card shows "⚠ 发布未完全生效"，点击可进入发布弹窗对失败节点重发布

### Requirement: User can view a stream proxy
The system SHALL display the full configuration of a stream proxy in a read-only view，分区顺序为 摘要（状态/版本/监听端口/协议）→ 转发（目标与权重/负载均衡）→ 高级（健康检查摘要/重试/超时/连接池）→ 元数据（创建/更新时间，格式带年并统一 formatDateTime）；DNS 型代理 SHALL 渲染域名映射表（与列表卡片同源）；健康检查区域对 NULL checks SHALL 显示「未配置」而非留空。

#### Scenario: View proxy details
- **WHEN** user clicks "查看" on a stream proxy card
- **THEN** the system opens a modal showing all proxy details including name, cluster, port, protocol, targets, load balance, timeout, keepalive, hash key, health check, retries

#### Scenario: DNS 型代理渲染域名映射
- **WHEN** 用户查看 `proxy_type=dns` 的代理
- **THEN** 抽屉 SHALL 按域名逐行渲染映射目标（与列表卡片一致），SHALL NOT 仅显示「无目标」

#### Scenario: 健康检查与重试展示
- **WHEN** 用户查看任意代理
- **THEN** 抽屉「高级」分区 SHALL 显示健康检查状态（已配置的摘要 / 未配置）与重试次数、重试超时

#### Scenario: 时间展示统一带年
- **WHEN** 抽屉展示创建/更新时间
- **THEN** SHALL 使用 `formatDateTime`（YYYY/MM/DD HH:mm:ss），与卡片时间粒度一致

### Requirement: User can edit a stream proxy
The system SHALL allow editing an existing stream proxy's configuration. Update payload field boundaries SHALL align with the create base schema: `name` SHALL be 1-100 characters and `listen_port` SHALL be 1-65535; out-of-range values MUST be rejected at validation time (4xx) and MUST NOT be persisted, so a rejected update can never leave a row that fails response validation. 编辑态 SHALL 默认直达配置步（第 2 步），原第 1 步内容压缩为摘要条（集群 · 端口 · 参考节点 + [修改] 展开）。

#### Scenario: Edit proxy name and targets
- **WHEN** user clicks "编辑" and modifies the proxy name and upstream targets
- **THEN** the system updates the proxy record in the database

#### Scenario: Cannot edit listen port
- **WHEN** user edits a stream proxy
- **THEN** the listen port field is read-only (port change requires delete and recreate)

#### Scenario: Update with out-of-range values is rejected without dirty rows
- **WHEN** a PUT update carries `listen_port` outside 1-65535 or `name` outside 1-100 characters
- **THEN** the API SHALL reject the request with a validation error (4xx) before any database write
- **AND** the existing row SHALL remain unchanged and readable (no 500 on subsequent GET)

#### Scenario: 编辑直达配置步
- **WHEN** 用户点击「编辑」
- **THEN** 向导 SHALL 直接打开第 2 步（转发与高级配置），顶部显示「集群 {name} · 端口 {port} · 参考节点 {ip} [修改]」摘要条
- **AND** 点击 [修改] 才展开第 1 步；新建流程 SHALL 保持两步原样

### Requirement: User can delete a stream proxy
The system SHALL support deleting a stream proxy from the database and/or Edge nodes, both individually and in batch. 删除确认的节点清单 SHALL 标注在线/离线（与发布确认同款样式），勾选 Edge 删除时 SHALL 默认全选在线节点（离线默认不选但可见）并提供全选/取消全选；子集勾选时 SHALL 显示后果行「未选中的 N 个节点将保留该转发规则并继续承载流量」；部分失败终态 SHALL 列出失败节点并提供「重试删除」。

#### Scenario: Delete from database only
- **WHEN** user deletes a proxy with "仅删除数据库" option
- **THEN** the system removes the `ps_stream_proxy` record and associated version history

#### Scenario: Delete from database and Edge nodes
- **WHEN** user deletes a proxy with "同时删除 Edge 节点" option and selects target nodes
- **THEN** the system removes the proxy from DB and calls Edge stream route DELETE API on selected nodes

#### Scenario: 批量删除四层代理
- **WHEN** 用户通过批量管理模式选择多个四层代理并确认删除
- **THEN** 系统 SHALL 通过批量端点 `DELETE /stream-proxies` 一次性删除所选代理（按集群分组逐条独立处理）
- **THEN** 每个代理的删除行为 SHALL 与单删一致（数据库/Edge 选项、版本历史清理）
- **AND** 单条失败 SHALL NOT 阻塞其余代理的删除

#### Scenario: 节点在线标识与默认全选
- **WHEN** 删除确认列出可选节点
- **THEN** 在线节点 SHALL 标注「在线」、离线节点 SHALL 标注「离线」（视觉可区分）
- **AND** 勾选「同时删除 Edge 节点」时 SHALL 默认勾选全部在线节点，离线节点默认不勾选

#### Scenario: 子集删除的后果说明
- **WHEN** 用户在 Edge 删除中仅勾选部分节点并确认
- **THEN** 确认弹窗 SHALL 显示「未选中的 {N} 个节点将保留该转发规则并继续承载流量」

#### Scenario: 部分失败可重试
- **WHEN** 删除执行后部分节点失败
- **THEN** 终态 SHALL 列出失败节点清单（ip + 失败原因）
- **AND** 提供「重试删除」操作，仅对失败节点重新执行

### Requirement: User can publish a stream proxy
The system SHALL allow publishing a stream proxy to selected Edge nodes as a stream route. 发布确认弹窗标题 SHALL 携带资源名「发布四层代理「{name}」」，且 SHALL 传入当前版本以提示「本次发布将创建 v(N+1)」（组件既有能力）。

#### Scenario: Publish to single node
- **WHEN** user clicks "发布", selects one node, and confirms
- **THEN** the system converts DB fields to Edge API format (targets→nodes dict, load_balance→type), calls Edge `PUT /stream/edge/admin/routes/{id}` via `EdgeClient.api("routes", "update", prefix="/stream")`, creates a `ConfigVersion` record, and marks the proxy as published

#### Scenario: Publish to multiple nodes
- **WHEN** user clicks "发布" and selects multiple nodes
- **THEN** the system publishes to each selected node sequentially via the publish progress modal (SSE streaming), showing per-node success/failure

#### Scenario: 发布确认版本提示
- **WHEN** 用户打开已发布代理的发布确认弹窗
- **THEN** 弹窗 SHALL 显示「本次发布将创建 v{N+1}」（N=当前版本）
- **AND** 弹窗标题 SHALL 为「发布四层代理「{name}」」

## ADDED Requirements

### Requirement: 列表状态筛选与空态

列表页 SHALL 提供状态快捷筛选（全部/未发布/待发布/已发布，含计数），与统计展示「共 N · 未发布 N · 待发布 N」；搜索无结果时 SHALL 与无数据空态区分：「没有匹配「{keyword}」的四层代理」+ 清除筛选按钮。

#### Scenario: 状态 Tab 筛选
- **WHEN** 用户点击「待发布」状态 Tab
- **THEN** 列表 SHALL 仅显示 `pending_publish=true` 的代理，Tab 显示计数
- **AND** 清除搜索词/切回「全部」恢复全量

#### Scenario: 搜索无结果空态
- **WHEN** 搜索关键词无匹配
- **THEN** 空态 SHALL 显示「没有匹配「{keyword}」的四层代理」并提供「清除筛选」操作
- **AND** 无任何数据时空态 SHALL 显示「暂无四层代理」引导创建
