# node-copy-batch-import

## Purpose

节点复制 + 批量导入——行操作复制按钮（模板预填）、文本粘贴批量导入（IP 段展开）、CSV 文件导入（模板下载 + 错误定位）、批量预览表格、批量创建 API 及逐条容错。

## Requirements

### Requirement: Copy node from existing node
The system SHALL allow admins to copy an existing node as a template for creating a new node.

#### Scenario: Copy button opens add modal with template pre-filled
- **WHEN** admin clicks the 复制 button on a node row
- **THEN** the add node modal SHALL open in single-add mode with the source node's service_port, management_port, edge_path, openresty_path, status pre-filled
- **AND** the ip field SHALL be empty for the admin to enter a new IP

### Requirement: Parse IP list from text
The system SHALL parse pasted text into a list of node IPs, supporting single IPs, IP ranges, and CIDR blocks.

#### Scenario: Single IP per line
- **WHEN** admin pastes `10.0.0.1` on one line
- **THEN** it SHALL parse to one node IP `10.0.0.1`

#### Scenario: IP range expanded
- **WHEN** admin pastes `10.0.0.1-10.0.0.5`
- **THEN** it SHALL expand to 5 IPs: `10.0.0.1` through `10.0.0.5`

#### Scenario: CIDR block expanded
- **WHEN** admin pastes `10.0.0.0/30`
- **THEN** it SHALL expand to usable addresses `10.0.0.1` and `10.0.0.2` (excluding network and broadcast)

#### Scenario: Invalid line flagged
- **WHEN** a pasted line is not a valid IP, range, or CIDR
- **THEN** the line SHALL be flagged invalid with an error message

#### Scenario: Expansion limit enforced
- **WHEN** a single input expands to more than 1000 IPs
- **THEN** the expansion SHALL be rejected with an error message

#### Scenario: Comment lines skipped in text paste
- **WHEN** a pasted line starts with `#` or `//`
- **THEN** it SHALL be skipped and not treated as a node

### Requirement: Parse node CSV file
The system SHALL parse an uploaded CSV file into node import rows, with template download support.

#### Scenario: CSV columns parsed
- **WHEN** a CSV has columns ip, service_port, management_port, edge_path, openresty_path, status
- **THEN** each row SHALL be parsed into a node import row with those fields

#### Scenario: Header row skipped
- **WHEN** the CSV contains a header row
- **THEN** the header row SHALL be skipped and not treated as a node

#### Scenario: Invalid row flagged with line number
- **WHEN** a CSV row has an invalid IP, invalid port range, invalid edge_path, or invalid status value (not 0 or 1)
- **THEN** the row SHALL be flagged invalid with its line number and error reason

#### Scenario: Template download
- **WHEN** admin clicks 下载模板
- **THEN** a CSV template file with headers and one example row SHALL be downloaded

### Requirement: Batch create nodes API
The system SHALL provide a batch endpoint to create multiple nodes in one cluster.

#### Scenario: Batch create request
- **WHEN** a request is sent to `POST /clusters/{cluster_id}/nodes/batch` with `nodes: [...]`
- **THEN** the system SHALL validate that `nodes` is not empty, otherwise return 400
- **THEN** the system SHALL validate that `nodes` does not exceed 1000 items, otherwise reject
- **THEN** the system SHALL create each node following single-node creation semantics
- **THEN** the system SHALL return per-node results grouped by node with ip and status
- **THEN** the message SHALL report success and failure counts separately

#### Scenario: Partial failure does not block others
- **WHEN** a batch create contains a node that fails (e.g. duplicate IP+edge_path+service_port, invalid data)
- **THEN** the system SHALL continue creating the remaining nodes
- **THEN** the failed node SHALL be reported with its error in the results

#### Scenario: Same IP with different path or port is allowed
- **WHEN** a batch create contains nodes sharing the same IP but different edge_path or service_port
- **THEN** all SHALL be created successfully (deduplication is by IP+edge_path+service_port combination)

### Requirement: Import nodes preview and submit
The system SHALL show an editable preview table of parsed nodes before batch creation.

#### Scenario: Preview table shows parsed nodes
- **WHEN** admin parses pasted text or uploaded CSV
- **THEN** a preview table SHALL list each node with ip, ports, edge_path, openresty_path, status columns
- **AND** invalid rows SHALL be highlighted in red with an error reason
- **AND** rows sharing the same IP SHALL be highlighted with a "IP 重复，请检查" warning (not blocking creation, since same IP with different path/port is valid)
- **AND** the edge_path and openresty_path SHALL be filled with fixed default values (/edge and /usr/local/nginx) applied to all rows, not auto-generated per row
- **AND** a row with an empty openresty_path (user cleared the default) SHALL be flagged invalid (必填，与单节点表单口径一致)

#### Scenario: Batch create with valid rows
- **WHEN** admin confirms import with N valid rows
- **THEN** the system SHALL call the batch create endpoint with those N nodes
- **THEN** on success the system SHALL refresh the node list

### Requirement: 独立页复制节点

节点管理独立页 SHALL 在行动作「更多」菜单提供「复制」入口：以当前行配置为模板打开本页添加弹窗，IP 清空待填，其余节点配置（服务端口/管理端口/SSH端口/Edge路径/OpenResty路径/管理开关）预填。

#### Scenario: 从现有节点复制
- **WHEN** 用户点击某节点「更多」菜单中的「复制」
- **THEN** 系统 SHALL 打开添加节点弹窗并预填该行的端口/路径/状态配置
- **AND** IP 字段 SHALL 为空待用户填写

#### Scenario: 复制后提交走既有创建
- **WHEN** 用户在预填弹窗中补全 IP 并提交
- **THEN** 系统 SHALL 走既有节点创建流程（含名称/IP 校验与查重）

### Requirement: 独立页批量导入

节点管理独立页 SHALL 提供批量导入入口：弹窗内选择目标集群、粘贴节点文本或上传 CSV 文件、解析预览后提交，与 Tab 共用同一解析校验（`parseIpList`/`parseNodeCsv`/`validateNodeImportRow`）与创建端点（`importNodes`）。

#### Scenario: 选择目标集群
- **WHEN** 用户打开批量导入弹窗
- **THEN** SHALL 先选择目标集群方可提交（集群下拉占位与模型初值精确匹配）
- **AND** 未选择集群时提交 SHALL 禁用

#### Scenario: 粘贴解析与预览
- **WHEN** 用户粘贴节点文本
- **THEN** 系统 SHALL 逐行解析并展示预览结果
- **AND** 解析或校验失败的行 SHALL 透传具体错误（含 OpenResty 路径必填）

#### Scenario: CSV 上传与模板下载
- **WHEN** 用户切换到 CSV 上传 tab
- **THEN** SHALL 可下载 CSV 模板并上传 `.csv` 文件（与 Tab 同一 `parseNodeCsv` 解析与模板）
- **AND** 解析结果 SHALL 进入同一预览流程

#### Scenario: 导入成功后刷新
- **WHEN** 导入提交成功
- **THEN** 系统 SHALL 关闭弹窗、刷新节点列表并清空选区
