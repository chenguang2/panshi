# node-copy-batch-import Delta

## MODIFIED Requirements

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
