## ADDED Requirements

### Requirement: System detects available stream ports from edge.env
The system SHALL read the remote edge.env file from a selected cluster node and parse available stream listen ports.

#### Scenario: Detect ports successfully
- **WHEN** user selects a cluster and reference node, clicks "检测可用端口"
- **THEN** the system reads the remote edge.env file via Ansible, parses `deploy.stream.edge.listen` addresses, extracts the port numbers, queries both DB (`ps_stream_proxy`) and Edge node (via `EdgeClient.api("stream_route", "list")`) for occupied ports, and returns a combined port status list

#### Scenario: Parse multiple listen addresses
- **WHEN** edge.env has multiple entries under `deploy.stream.edge.listen` (e.g., `- addr: 0.0.0.0:9970`, `- addr: 0.0.0.0:9971`)
- **THEN** the system extracts all unique port numbers (9970, 9971)

#### Scenario: Handle non-standard listen format
- **WHEN** edge.env listen entry includes SSL or other options (e.g., `- addr: 0.0.0.0:9943 ssl: true`)
- **THEN** the system still correctly extracts port 9943

#### Scenario: Stream module is disabled in edge.env
- **WHEN** edge.env has Stream configured as `NOstream` (disabled)
- **THEN** the system shows a warning "Stream 模块未启用" and lists no ports

#### Scenario: custom include ports are ignored
- **WHEN** `deploy.stream.custom.include` references external config files with additional listen ports
- **THEN** the system does NOT parse those files and only reports ports from `deploy.stream.edge.listen`

#### Scenario: edge.env read fails
- **WHEN** the remote node is unreachable or SSH connection fails
- **THEN** the system shows an error message with the failure reason and allows manual port input

### Requirement: System distinguishes available vs occupied ports
The system SHALL query existing stream proxies AND Edge node stream routes to determine which detected ports are already in use.

#### Scenario: Port available
- **WHEN** a detected port is not in `ps_stream_proxy` for the same cluster AND not in Edge node's stream route list
- **THEN** the port is displayed as green/selectable with "✅ 可用" label

#### Scenario: Port occupied by DB record
- **WHEN** a detected port is already used by another stream proxy in `ps_stream_proxy` for the same cluster
- **THEN** the port is displayed as grey/unselectable with "❌ 已占用 (占用者名称)" label and `source: "db"`

#### Scenario: Port occupied by existing Edge route
- **WHEN** a detected port is NOT in `ps_stream_proxy` but IS in the Edge node's stream route list (manually created or from other system)
- **THEN** the port is displayed as grey/unselectable with "❌ Edge 节点上已有路由" label and `source: "edge"`

#### Scenario: Port not in edge.env stream.listen
- **WHEN** a port is in use but NOT in the edge.env `deploy.stream.edge.listen` list
- **THEN** the port is displayed as grey/unselectable with "⚠️ 未在 edge.env 配置中" label

### Requirement: Port detection shows real-time progress
The system SHALL display streaming logs during the port detection process, matching the EdgeEnv read pattern.

#### Scenario: Show connection progress
- **WHEN** port detection starts
- **THEN** the system shows a modal with real-time log lines from the remote read operation (e.g., "正在连接远程主机...", "读取 edge.env ...")

#### Scenario: Show completion
- **WHEN** port detection completes successfully
- **THEN** the system shows "✅ 配置读取完成" and displays the port list

### Requirement: User can manually input a port (fallback)
The system SHALL allow manual port input when automatic detection fails or is not needed.

#### Scenario: Manual port input
- **WHEN** automatic port detection fails or user chooses to skip detection
- **THEN** the system shows a text input field for entering a port number directly (with validation: 1-65535)
