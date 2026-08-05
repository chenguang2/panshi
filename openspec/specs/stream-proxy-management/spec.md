## ADDED Requirements

### Requirement: User can create a stream proxy
The system SHALL allow authorized users to create a Layer 4 (TCP/UDP) stream proxy configuration using a two-step wizard.

#### Scenario: Create stream proxy with basic setup
- **WHEN** user clicks "新建四层代理" button and completes Step 1 (selects cluster, node, detects port, selects available port) and Step 2 (fills name, upstream targets, load balance)
- **THEN** the system creates a `ps_stream_proxy` record and returns to the list page with the new proxy visible
- **AND** target node address SHALL accept IPv4、IPv6（`::1` or `[::1]`）、domain name
- **AND** target node address SHALL be auto-detected and validated accordingly
- **AND** invalid address SHALL display a specific error message
- **AND** IPv6 address without brackets SHALL be automatically wrapped as `[::1]` when building target string

#### Scenario: 第一步必填校验
- **WHEN** 用户在创建向导第一步未选择集群或节点
- **THEN** "下一步"按钮 SHALL 为禁用状态
- **AND** 点击"下一步"时 SHALL 显示内联错误提示
- **AND** 集群和节点下拉框失去焦点时 SHALL 触发实时校验

#### Scenario: Create stream proxy with minimal fields
- **WHEN** user creates a stream proxy with only name, port, and one target (IP:port + weight)
- **THEN** the system creates the proxy with defaults for all other fields (tcp protocol, weighted_roundrobin LB)
- **AND** target node host SHALL support domain name in addition to IP

#### Scenario: Create on occupied port is rejected
- **WHEN** user attempts to create a stream proxy on a port already used by another proxy in the same cluster or occupied on Edge node
- **THEN** the system rejects the creation with an error message "端口已被占用"

### Requirement: User can list stream proxies
The system SHALL display stream proxies in a card-grid layout with two separate views: 四层代理 and DNS 代理，通过侧边栏菜单和 `route.query.type` 参数区分。共享逻辑通过 `useStreamProxyList` composable 复用。侧边栏菜单名为"四层代理"（不再叫"TCP代理"，因其覆盖 TCP/UDP/TLS 三种协议）。

#### Scenario: List 四层代理 (normal proxies)
- **WHEN** user clicks "四层代理" in sidebar
- **THEN** the system navigates to `/stream-proxies?type=normal`
- **AND** displays only `proxy_type=normal` proxies as cards
- **AND** page title SHALL be "四层代理"
- **AND** page header description SHALL 说明该视图覆盖 TCP/UDP/TLS 三种四层转发协议

#### Scenario: List DNS proxies
- **WHEN** user clicks "DNS代理" in sidebar
- **THEN** the system navigates to `/stream-proxies?type=dns`
- **AND** displays only `proxy_type=dns` proxies as cards
- **AND** page title SHALL be "DNS 代理"

#### Scenario: Switch between 四层代理/DNS views
- **WHEN** user clicks the other proxy type in the sidebar
- **THEN** the system SHALL reload data with the new `proxy_type` filter without full page reload

#### Scenario: Filter by cluster
- **WHEN** user selects a cluster from the filter dropdown
- **THEN** the system shows only stream proxies belonging to that cluster

#### Scenario: Search by name
- **WHEN** user types a search keyword
- **THEN** the system filters stream proxies whose name matches the keyword

### Requirement: 共享 composable
StreamProxy 列表页的 script 逻辑 SHALL 抽取为 `useStreamProxyList(proxyType)` composable，两个视图共享。

#### Scenario: composable 提供共享状态
- **WHEN** TCP 或 DNS 页面执行加载/筛选/CRUD/发布/版本管理操作
- **THEN** 所有逻辑 SHALL 来自 composable
- **AND** 后端 API 请求 SHALL 携带 `proxy_type` 参数

### Requirement: User can view a stream proxy
The system SHALL display the full configuration of a stream proxy in a read-only view.

#### Scenario: View proxy details
- **WHEN** user clicks "查看" on a stream proxy card
- **THEN** the system opens a modal showing all proxy details including name, cluster, port, protocol, targets, load balance, timeout, keepalive, hash key, health check, retries

### Requirement: User can edit a stream proxy
The system SHALL allow editing an existing stream proxy's configuration.

#### Scenario: Edit proxy name and targets
- **WHEN** user clicks "编辑" and modifies the proxy name and upstream targets
- **THEN** the system updates the proxy record in the database

#### Scenario: Cannot edit listen port
- **WHEN** user edits a stream proxy
- **THEN** the listen port field is read-only (port change requires delete and recreate)

### Requirement: User can delete a stream proxy
The system SHALL support deleting a stream proxy from the database and/or Edge nodes.

#### Scenario: Delete from database only
- **WHEN** user deletes a proxy with "仅删除数据库" option
- **THEN** the system removes the `ps_stream_proxy` record and associated version history

#### Scenario: Delete from database and Edge nodes
- **WHEN** user deletes a proxy with "同时删除 Edge 节点" option and selects target nodes
- **THEN** the system removes the proxy from DB and calls Edge stream route DELETE API on selected nodes

### Requirement: User can publish a stream proxy
The system SHALL allow publishing a stream proxy to selected Edge nodes as a stream route.

#### Scenario: Publish to single node
- **WHEN** user clicks "发布", selects one node, and confirms
- **THEN** the system converts DB fields to Edge API format (targets→nodes dict, load_balance→type), calls Edge `PUT /stream/edge/admin/routes/{id}` via `EdgeClient.api("routes", "update", prefix="/stream")`, creates a `ConfigVersion` record, and marks the proxy as published

#### Scenario: Publish to multiple nodes
- **WHEN** user clicks "发布" and selects multiple nodes
- **THEN** the system publishes to each selected node sequentially via the publish progress modal (SSE streaming), showing per-node success/failure

### Requirement: Stream proxy supports version management
The system SHALL maintain version history for each stream proxy and support rollback.

#### Scenario: View version history
- **WHEN** user clicks "版本管理" on a published proxy
- **THEN** the system shows all published versions with timestamps, creator info, and option to rollback

#### Scenario: Rollback to previous version
- **WHEN** user clicks "回滚" on a version
- **THEN** the system restores that version's config as the current draft and marks for re-publish

### Requirement: Stream proxy supports load balancing
The system SHALL support multiple load balancing algorithms for stream upstreams.

#### Scenario: Select weighted round-robin
- **WHEN** user selects "加权轮询" as the LB algorithm
- **THEN** the system uses `weighted_roundrobin` and publishes as `roundrobin` to Edge

#### Scenario: Select consistent hashing
- **WHEN** user selects "一致性哈希" as the LB algorithm
- **THEN** the system uses `chash` LB algorithm
- **THEN** the UI SHALL display a read-only "Hash Key: remote_addr" field
- **THEN** the backend SHALL save `hash_on = 'vars'` and `key = 'remote_addr'`

#### Scenario: Configure EWMA or least_conn
- **WHEN** user selects "EWMA" or "最少连接"
- **THEN** the system applies the selected algorithm without additional parameters

### Requirement: Stream proxy supports advanced config
The system SHALL allow configuring timeout, keepalive pool, protocol, and optional match conditions.

#### Scenario: Configure timeout
- **WHEN** user expands advanced config and sets connect/send/read timeout values
- **THEN** the system stores and publishes these timeout values to Edge

#### Scenario: Configure keepalive pool
- **WHEN** user expands advanced config and sets keepalive pool size, idle timeout, max requests
- **THEN** the system stores and publishes these keepalive values to Edge

#### Scenario: Select TCP, UDP or TLS protocol
- **WHEN** user selects the protocol in Step 2 of the wizard via a Radio control with three options: TCP (默认), UDP, TLS
- **THEN** the system stores `scheme='tcp'` (default), `scheme='udp'`, or `scheme='tls'` respectively
- **AND** each Radio option SHALL display a one-line description of the protocol difference (TCP: 面向连接的流式传输；UDP: 无连接的报文传输；TLS: 加密的 TCP 传输)
- **AND** after selection, the system SHALL display a dynamic hint below describing the publish behavior of the selected protocol
- **AND** TLS SHALL NOT require selecting a certificate or any additional fields — only `scheme='tls'` is stored
- **AND** UDP SHALL be identical to TCP except for the `scheme` value
- **AND** publish SHALL send the top-level protocol to Edge as `"TCP"` (for tcp/tls) or `"UDP"` (for udp)——Edge 的 stream route `protocol` 枚举仅接受 `"TCP"`/`"UDP"`，TLS 通过 `upstream.scheme="tls"` 表达

#### Scenario: Configure retries
- **WHEN** user expands advanced config and sets retry count and retry timeout
- **THEN** the system stores and publishes these retry values to Edge

#### Scenario: Configure health check
- **WHEN** user expands advanced config and edits the health check JSON
- **THEN** the JSON SHALL be saved to the `checks` field and published to Edge

### Requirement: Stream proxy list shows publish status
The system SHALL display the publish status (published version + timestamp, or unpublished) on each card.

#### Scenario: Show published status
- **WHEN** a proxy has been published and has `current_version`
- **THEN** the card shows a green "已发布 v{version} · {date}" badge

#### Scenario: Show unpublished status
- **WHEN** a proxy has no `current_version`
- **THEN** the card shows a neutral "未发布" badge

### Requirement: DNS 模式域名配置
DNS 模式四层代理 SHALL 支持每个域名独立配置 TTL、健康检查和可选的日志生成。

#### Scenario: TTL 配置
- **WHEN** 用户创建或编辑 DNS 模式四层代理
- **THEN** 每个域名行 SHALL 显示 TTL 输入框（默认 10，单位秒）
- **AND** 发布到 Edge 时 SHALL 将 `ttl_valid` 字段写入 dns_upstream hosts

#### Scenario: DNS 模式健康检查（默认开启）
- **WHEN** 用户新建 DNS 域名
- **THEN** 健康检查复选框 SHALL 默认勾选
- **AND** JSON 编辑器 SHALL 默认填充 `{"type": "http", "active": {}, "passive": {}}`
- **AND** 发布到 Edge 时 SHALL 将 checks 写入每个域名

#### Scenario: DNS 模式健康检查（关闭）
- **WHEN** 用户取消勾选健康检查复选框
- **THEN** 该域名的 checks SHALL 不包含在发布的配置中

#### Scenario: DNS 模式生成日志
- **WHEN** 用户勾选"生成日志"复选框
- **THEN** 发布的 `plugins` SHALL 包含 `"log_process": {"logs": ["logs/process.stream.log"]}`
- **AND** 生成日志复选框 SHALL 默认不勾选

#### Scenario: DNS 模式编辑回读
- **WHEN** 用户编辑已有的 DNS 四层代理
- **THEN** 已有域名的健康检查状态 SHALL 根据 `cfg.checks` 是否存在决定
- **AND** JSON 编辑器 SHALL 回显已有 checks
- **AND** log_process SHALL 根据 `dns_config.log_process` 是否存在决定复选框状态

#### Scenario: DNS 目标节点字段校验
- **WHEN** 用户创建或编辑 DNS 模式四层代理
- **THEN** 每个域名下的目标节点 SHALL 使用独立的 IP 和端口输入框
- **AND** IP 字段 SHALL 校验格式（IPv4）
- **AND** 端口字段 SHALL 校验范围（1-65535）

#### Scenario: 协议与 DNS 模式说明
- **WHEN** 用户创建或编辑 DNS 模式四层代理
- **THEN** 协议区域 SHALL 显示 `UDP` 徽标，并在同一行显示说明文字「DNS 模式下，请求将使用 dns_upstream 插件进行域名解析，不配置标准上游节点。」
- **AND** 页面 SHALL NOT 显示独立的上游配置占位区域（`{"type": "roundrobin", "scheme": "tcp"}` 已移除）

### Requirement: DNS 模式内外网分离配置

DNS 模式四层代理 SHALL 支持内外网分离（WAN/LAN）配置：通过开关启用后，额外生成 `dns_upstream-ww` 插件，按来源 IP 区分内/外网 DNS 查询返回。该配置 SHALL 以开关式内联在 DNS 模式表单中，并保持向后兼容（未启用时行为与现状完全一致）。

#### Scenario: 内外网分离开关（第一页）
- **WHEN** 用户创建或编辑 DNS 模式四层代理
- **THEN** 表单第一步（端口选择页）SHALL 提供「启用内外网分离」复选框（默认关闭）
- **AND** 未启用时发布的 `plugins` SHALL 仅包含 `dns_upstream`（不含 `dns_upstream-ww`），与现状一致
- **AND** 启用后发布 SHALL 额外生成 `dns_upstream-ww` 插件
- **AND** DNS 代理的 `scheme` SHALL 固定为 `udp`（创建/更新时后端强制为 udp，忽略客户端传入的 scheme；发布时 Edge `protocol` 为 `UDP`）

#### Scenario: 域名配置单次输入 + 节点行内联外网地址
- **WHEN** 内外网分离已启用
- **THEN** 域名/负载均衡/TTL/健康检查 SHALL 与未启用时一样只输入一次（不复制域名配置）
- **AND** 每个目标节点行 SHALL 增加「外网地址」列（仅开关开启时显示）
- **AND** 外网地址 SHALL 只填写 IPv4（端口复用内网端口，不支持 IPv6/CIDR）
- **AND** 提交时 SHALL 将各节点外网地址组装为该域名下的 `export_nodes`（key=内网 `ip:port`，value=外网 IP）

#### Scenario: 外网访问来源过滤（_meta.filter）
- **WHEN** 内外网分离已启用
- **THEN** 表单 SHALL 提供「包含 IP/网段」与「排除 IP/网段」两个可编辑列表（支持 IPv4 与 CIDR）
- **AND** 发布时 SHALL 将包含列表生成**一个** `["remote_addr", "ip~", [ips]]` 条件（列表内 IP 为 OR 关系）
- **AND** 发布时 SHALL 将排除列表生成**一个** `["remote_addr", "!", "ip~", [ips]]` 条件（列表内 IP 为 OR 关系）
- **AND** `dns_upstream-ww._meta.priority` SHALL 固定为 `2110`（用户不可修改）
- **AND** `_meta.filter` 最外层数组内各条件 SHALL 按 AND 关系判定（来源需满足全部条件才由 ww 插件接管返回外网地址，否则落到内网 `dns_upstream`）

#### Scenario: 映射完整性校验（强化）
- **WHEN** 用户保存或发布已启用内外网分离的 DNS 代理，且某域名存在未填写外网地址的节点
- **THEN** 系统 SHALL 拒绝保存/发布并提示「启用内外网分离时每个节点的外网地址必须填写」（前端与后端双重拦截，防止未映射节点对外网查询返回内网地址泄露拓扑）
- **WHEN** 用户保存或发布已启用内外网分离的 DNS 代理，且某外网地址不是合法 IPv4
- **THEN** 系统 SHALL 拒绝保存/发布并提示格式错误
- **WHEN** 用户保存或发布已启用内外网分离的 DNS 代理，且 `wan_filter` 的包含/排除列表含非法 IP 或网段（如 `127..0.0.1`）
- **THEN** 系统 SHALL 拒绝保存/发布并提示具体非法值（前端添加时即校验拦截，后端发布时二次校验，防止非法 IP 透传到 Edge 导致 `dns_upstream-ww` 插件崩溃返回 502）

#### Scenario: 开关切换保留数据
- **WHEN** 用户在编辑已启用内外网分离的代理时关闭开关，随后重新打开
- **THEN** 已填写的节点外网地址数据 SHALL 保留（不清空）
- **AND** 关闭状态下保存 SHALL 不组装 export_nodes（`wan_*` 不写入）

#### Scenario: 客户端 CIDR 隐藏
- **WHEN** 用户创建或编辑 DNS 模式四层代理
- **THEN** 域名目标节点的「客户端 CIDR」输入框 SHALL 默认隐藏（不展示）
- **AND** CIDR 值 SHALL 始终为空，提交时不写入 nodes（nodes 值为空数组）

#### Scenario: 详情页展示内外网分离状态
- **WHEN** 用户查看 DNS 模式四层代理的详情
- **THEN** 若 `dns_config.wan_enabled` 为 true，详情页 SHALL 展示「内外网分离」状态徽标
- **AND** 若未启用，详情页 SHALL 不展示该徽标

#### Scenario: 编辑回读与导入兼容
- **WHEN** 用户编辑已启用内外网分离的 DNS 四层代理，或从 Edge 导入含 `dns_upstream-ww` 插件的配置
- **THEN** 开关 SHALL 回显为开启
- **AND** `export_nodes` 映射 SHALL 还原到各域名节点行的外网地址列（值去除端口）
- **AND** `_meta.filter` SHALL 还原为包含/排除列表（包含条件 → include 列表，排除条件 → exclude 列表）
- **WHEN** Edge 配置不含 `dns_upstream-ww` 插件
- **THEN** 开关 SHALL 为关闭，且 `wan_*` 字段 SHALL 不写入持久化配置

### Requirement: 四层代理协议合法性校验（仅约束写入）
后端创建/更新 schema（`StreamProxyCreate`/`StreamProxyUpdate`）SHALL 限制 stream proxy 的 `scheme` 字段取值，只允许 `tcp`、`udp`、`tls` 三个值。`StreamProxyBase` 与响应 schema SHALL 保持宽松（不继承 Literal），确保存量/导入的非三值数据读取不受影响。

#### Scenario: 合法 scheme 值被接受
- **WHEN** 用户通过 API 创建或更新代理，`scheme` 为 `tcp`、`udp` 或 `tls` 之一
- **THEN** 请求 SHALL 被接受并正常保存

#### Scenario: 非法 scheme 值被拒绝
- **WHEN** 用户通过 API 提交 `scheme` 为其他值（如 `grpc`、`tcp_udp`）
- **THEN** 请求 SHALL 被拒绝并返回 422 校验错误

#### Scenario: 存量非三值 scheme 读取正常
- **WHEN** 数据库中已存在 `scheme` 非三值的代理（如历史 `tcp_udp`）
- **THEN** 该代理的列表、详情、发布接口 SHALL 正常返回（不因响应 schema 校验失败而 500）

### Requirement: 导入 scheme 归一化
Edge 数据导入时，导入的 stream proxy `scheme` SHALL 归一化为三值之一，防止绕过 API 校验写入非法值。

#### Scenario: 导入合法 scheme
- **WHEN** Edge 上游返回的 scheme 为 `tcp`、`udp` 或 `tls`
- **THEN** 导入产物 SHALL 保留该值

#### Scenario: 导入非法 scheme 被归一化
- **WHEN** Edge 上游返回的 scheme 为其他值（如 `http`、`grpc`、遗留 `tcp_udp`）
- **THEN** 导入产物 SHALL 将该值归一化为 `tcp`
