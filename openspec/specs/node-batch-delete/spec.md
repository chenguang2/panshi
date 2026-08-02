# node-batch-delete

## Purpose

单集群内批量删除节点——前端双状态选择（行点击单选 + checkbox 批量）、删除按钮分流、跨页保留、确认弹窗 IP 列表、批量删除 API 及逐条容错、批量进度展示。

## Requirements

### Requirement: Batch delete nodes in cluster detail tab
The system SHALL allow admins to batch-delete multiple nodes within a single cluster from the cluster detail page's nodes tab.

#### Scenario: Batch delete button with selection
- **WHEN** admin checks more than one node in the nodes table of a cluster detail page
- **THEN** the delete button SHALL show as "删除节点(N)" where N is the number of checked nodes
- **THEN** single-selection buttons (编辑/启动/停止/状态查询) SHALL be disabled even if a row is clicked afterwards
- **THEN** the checked nodes SHALL remain checked when navigating to a different page (preserveSelectedRowKeys)
- **WHEN** admin searches or sorts the nodes table
- **THEN** the checked selection SHALL be cleared

#### Scenario: Delete button routes to single delete when no batch selection
- **WHEN** no node is checked but a single node is selected via row click
- **THEN** the delete button SHALL trigger the existing single-node delete flow

#### Scenario: Batch delete with database
- **WHEN** admin confirms batch delete with 数据库 checked
- **THEN** the system SHALL delete the database records for each selected node

#### Scenario: Edge phase always skipped
- **WHEN** admin confirms batch delete with Edge 节点 checked
- **THEN** the Edge phase SHALL be reported as "skipped" for each node (nodes are Edge runtimes and have no corresponding Edge API delete operation)

#### Scenario: Partial failure does not block others
- **WHEN** a batch delete contains a node that fails to delete (e.g. node not found)
- **THEN** the system SHALL continue deleting the remaining nodes
- **THEN** the failed node SHALL be reported with its error in the results

#### Scenario: Progress dialog logs per node
- **WHEN** batch delete is in progress
- **THEN** the progress dialog SHALL log each node's database and edge result (e.g. `删除节点 10.0.0.1: 数据库✅ / Edge 跳过`)

#### Scenario: Selection cleared after batch delete
- **WHEN** a batch delete completes successfully
- **THEN** the checked selection (selectedNodeKeys) SHALL be cleared
- **THEN** the single selection (selectedNode) SHALL be cleared

### Requirement: Confirm dialog lists selected node IPs
The system SHALL show the IPs of all selected nodes in the batch delete confirmation dialog to prevent mis-deletion.

#### Scenario: Fewer than 4 selected nodes listed fully
- **WHEN** admin triggers batch delete with 1-3 nodes selected
- **THEN** the confirmation dialog title SHALL list all selected node IPs

#### Scenario: More than 3 selected nodes truncated
- **WHEN** admin triggers batch delete with more than 3 nodes selected
- **THEN** the confirmation dialog title SHALL list the first node IPs followed by "等 N 条" where N is the total count

### Requirement: Batch delete API
The system SHALL provide a batch delete endpoint that deletes multiple nodes in one cluster.

#### Scenario: Batch delete request
- **WHEN** a request is sent to `DELETE /clusters/{cluster_id}/nodes` with `node_ids`, `delete_db`, `delete_edge`, `node_ids`
- **THEN** the system SHALL validate that at least one of `delete_db` or `delete_edge` is true, otherwise return 400
- **THEN** the system SHALL validate that `node_ids` is not empty, otherwise return 400
- **THEN** the system SHALL delete each node following the single-node delete semantics (database rows and/or edge skipped)
- **THEN** the system SHALL return a message and per-node results grouped by node_id with node_ip

#### Scenario: Empty node_ids rejected
- **WHEN** `node_ids` is empty
- **THEN** the system SHALL return a 400 error

#### Scenario: Database error in one item does not break the batch
- **WHEN** a database operation fails mid-transaction for one node (before commit)
- **THEN** the session SHALL be rolled back for that item
- **THEN** the failed node SHALL be reported with its error in the results
- **THEN** the remaining nodes SHALL still be deletable (no PendingRollbackError cascade)
