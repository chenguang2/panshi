## MODIFIED Requirements

### Requirement: Copy node from existing node

The system SHALL allow admins to copy an existing node as a template for creating a new node.

#### Scenario: Copy button opens add modal with template pre-filled
- **WHEN** admin clicks the 复制 button on a node row
- **THEN** the add node modal SHALL open in single-add mode with the source node's service_port, management_port, edge_path, openresty_path, status pre-filled
- **AND** the ip field SHALL be empty for the admin to enter a new IP

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

### Requirement: Import nodes preview and submit

The system SHALL show an editable preview table of parsed nodes before batch creation.

#### Scenario: Preview table shows parsed nodes
- **WHEN** admin parses pasted text or uploaded CSV
- **THEN** a preview table SHALL list each node with ip, ports, edge_path, openresty_path, status columns
- **AND** invalid rows SHALL be highlighted in red with an error reason
- **AND** rows sharing the same IP SHALL be highlighted with a "IP 重复，请检查" warning (not blocking creation, since same IP with different path/port is valid)
- **AND** the edge_path and openresty_path SHALL be filled with fixed default values (/edge and /usr/local/nginx) applied to all rows, not auto-generated per row
