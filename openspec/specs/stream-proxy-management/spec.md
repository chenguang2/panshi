## ADDED Requirements

### Requirement: User can create a stream proxy
The system SHALL allow authorized users to create a Layer 4 (TCP/UDP) stream proxy configuration using a two-step wizard.

#### Scenario: Create stream proxy with basic setup
- **WHEN** user clicks "新建四层代理" button and completes Step 1 (selects cluster, node, detects port, selects available port) and Step 2 (fills name, upstream targets, load balance)
- **THEN** the system creates a `ps_stream_proxy` record and returns to the list page with the new proxy visible

#### Scenario: 第一步必填校验
- **WHEN** 用户在创建向导第一步未选择集群或节点
- **THEN** "下一步"按钮 SHALL 为禁用状态
- **AND** 点击"下一步"时 SHALL 显示内联错误提示
- **AND** 集群和节点下拉框失去焦点时 SHALL 触发实时校验

#### Scenario: Create stream proxy with minimal fields
- **WHEN** user creates a stream proxy with only name, port, and one target (IP:port + weight)
- **THEN** the system creates the proxy with defaults for all other fields (tcp protocol, weighted_roundrobin LB)

#### Scenario: Create on occupied port is rejected
- **WHEN** user attempts to create a stream proxy on a port already used by another proxy in the same cluster or occupied on Edge node
- **THEN** the system rejects the creation with an error message "端口已被占用"

### Requirement: User can list stream proxies
The system SHALL display all stream proxies in a card-grid layout, filterable by cluster and searchable by name.

#### Scenario: List all stream proxies
- **WHEN** user navigates to the "四层代理" page
- **THEN** the system displays all stream proxies as cards in a 3-column grid, each showing: cluster name, proxy name, description, listen port, load balance algorithm, upstream targets, publish status

#### Scenario: Filter by cluster
- **WHEN** user selects a cluster from the filter dropdown
- **THEN** the system shows only stream proxies belonging to that cluster

#### Scenario: Search by name
- **WHEN** user types a search keyword
- **THEN** the system filters stream proxies whose name matches the keyword

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

#### Scenario: Select TCP or UDP protocol
- **WHEN** user selects "TCP" or "UDP" in the protocol toggle
- **THEN** the system stores the scheme and publishes with the correct protocol

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

#### Scenario: 上游配置占位
- **WHEN** 用户查看 DNS 模式四层代理的配置详情页
- **THEN** 页面 SHALL 显示上游配置占位区域，内容固定为 `{"type": "roundrobin", "scheme": "tcp"}`
- **AND** 该区域 SHALL 为只读样式
