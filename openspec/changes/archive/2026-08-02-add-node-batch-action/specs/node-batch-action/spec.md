## ADDED Requirements

### Requirement: Batch node action (start/stop/reload)
The system SHALL allow admins to batch-execute start/stop/reload operations on multiple nodes within a single cluster from the cluster detail page's nodes tab.

#### Scenario: Batch action button with selection
- **WHEN** admin checks more than one node in the nodes table of a cluster detail page
- **THEN** the toolbar action buttons (启动/停止/reload) SHALL show with a count suffix (e.g. "启动(2)")
- **AND** clicking an action button SHALL trigger the batch operation on all checked nodes

#### Scenario: Batch action confirmation lists node IPs
- **WHEN** admin triggers a batch action with N nodes checked
- **THEN** a confirmation dialog SHALL list the selected node IPs (≤3 full, >3 truncated with "等 N 条")
- **AND** the batch request SHALL NOT be sent until confirmed

#### Scenario: Batch action executes on all selected nodes
- **WHEN** admin confirms a batch start/stop/reload
- **THEN** the system SHALL execute the action on each node sequentially by calling the per-node endpoint (`POST /clusters/{cluster_id}/nodes/{node_id}/{action}`)
- **THEN** a progress modal SHALL show each node's IP with live status (等待中/执行中/成功/失败)
- **AND** clicking a node row SHALL expand its command, rc, stdout, and stderr logs

#### Scenario: Batch action results shown per node
- **WHEN** the batch action completes
- **THEN** each node row SHALL show its final success/failure status
- **AND** failure of one node SHALL NOT block the remaining nodes

#### Scenario: Selection cleared after batch action
- **WHEN** a batch action completes successfully
- **THEN** the checked selection (selectedNodeKeys) SHALL be cleared
- **THEN** the single selection (selectedNode) SHALL be cleared
- **THEN** the node list SHALL be refreshed

### Requirement: Batch node status query
The system SHALL allow admins to query the status of multiple nodes at once and display results in a table.

#### Scenario: Batch status query shows progress then results table
- **WHEN** admin triggers a batch status query with multiple nodes checked
- **THEN** a progress modal SHALL show each node's IP with live status (等待中/执行中/成功/失败), executed with concurrency limit
- **THEN** after completion the progress modal SHALL close and a results table SHALL list each node with IP, Edge version, health status, and failure reason columns
- **AND** clicking a row's 详情 button SHALL expand that node's full process details (command, stdout, stderr)
- **AND** health status SHALL be derived from the node's status (1=健康, 0=离线), not from the statistic response

#### Scenario: Batch status query execution
- **WHEN** admin confirms a batch status query
- **THEN** the system SHALL query each node's status by calling the per-node statistic endpoint (`POST /clusters/{cluster_id}/nodes/{node_id}/statistic`), with a concurrency limit
- **THEN** the node list SHALL be refreshed after completion (to reflect updated Edge versions)

### Requirement: Batch action API enhancement
The system SHALL enhance the batch node action endpoint to support reload and return full execution logs.

#### Scenario: BatchAction supports reload
- **WHEN** a batch action request uses action `reload`
- **THEN** the backend SHALL map it to `nginx_reload` and execute

#### Scenario: Batch results include stdout/stderr/command
- **WHEN** the batch action endpoint returns per-node results
- **THEN** each successful result SHALL include `stdout`, `stderr`, and `command` fields
- **THEN** each failed result SHALL include the error `detail`
