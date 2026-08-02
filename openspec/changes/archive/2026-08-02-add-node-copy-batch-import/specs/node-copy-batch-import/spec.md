## ADDED Requirements

### Requirement: Copy node from existing node
The system SHALL allow admins to copy an existing node as a template for creating a new node.

#### Scenario: Copy button opens add modal with template pre-filled
- **WHEN** admin clicks the 复制 button on a node row
- **THEN** the add node modal SHALL open in single-add mode with the source node's service_port, management_port, edge_path, edge_install_path, status pre-filled
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

### Requirement: Parse node CSV file
The system SHALL parse an uploaded CSV file into node import rows, with template download support.

#### Scenario: CSV columns parsed
- **WHEN** a CSV has columns ip, service_port, management_port, edge_path, edge_install_path, status
- **THEN** each row SHALL be parsed into a node import row with those fields

#### Scenario: Header row skipped
- **WHEN** the CSV contains a header row
- **THEN** the header row SHALL be skipped and not treated as a node

#### Scenario: Invalid row flagged with line number
- **WHEN** a CSV row has an invalid IP, invalid port range, invalid edge_path, or invalid status value (not 0 or 1)
- **THEN** the row SHALL be flagged invalid with its line number and error reason

#### Scenario: Comment lines skipped in text paste
- **WHEN** a pasted line starts with `#` or `//`
- **THEN** it SHALL be skipped and not treated as a node

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
- **THEN** a preview table SHALL list each node with ip, ports, edge_path, status columns
- **AND** invalid rows SHALL be highlighted in red with an error reason
- **AND** rows sharing the same IP SHALL be highlighted with a "IP 重复，请检查" warning (not blocking creation, since same IP with different path/port is valid)

#### Scenario: Batch create with valid rows
- **WHEN** admin confirms import with N valid rows
- **THEN** the system SHALL call the batch create endpoint with those N nodes
- **THEN** on success the system SHALL refresh the node list
