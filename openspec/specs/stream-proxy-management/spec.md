## ADDED Requirements

### Requirement: User can create a stream proxy
The system SHALL allow authorized users to create a Layer 4 (TCP/UDP) stream proxy configuration.

#### Scenario: Create stream proxy with basic setup
- **WHEN** user clicks "新建四层代理" button and completes Step 1 (selects cluster, node, detects port, selects available port) and Step 2 (fills name, upstream targets, load balance)
- **THEN** the system creates a `ps_stream_proxy` record and returns to the list page with the new proxy visible

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
