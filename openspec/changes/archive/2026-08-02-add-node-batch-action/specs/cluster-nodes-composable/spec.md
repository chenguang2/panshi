## MODIFIED Requirements

### Requirement: useClusterNodes composable
The system SHALL provide a `useClusterNodes` composable that encapsulates all cluster node related state and operations.

#### Scenario: Composable returns reactive state
- **WHEN** `useClusterNodes(cluster)` is called
- **THEN** it SHALL return `{ nodes, nodesLoading, nodesPagination, nodesSearch, nodesSearchField, nodesSortBy, nodesSortOrder, loadNodes, deleteNode, deleteNodes, editNode, addNode, publishNode, openNodeVersionManagement, loadNodeStatus, startNode, stopNode, copyNode, parseIpList, parseNodeCsv, importNodes, batchNodeAction, batchNodeStatus }`

#### Scenario: loadNodes fetches from API
- **WHEN** `loadNodes(clusterId)` is called
- **THEN** it SHALL call `GET /api/v1/clusters/{clusterId}/nodes` with pagination and search params
- **THEN** it SHALL update `nodes`, `nodesPagination` reactive refs

#### Scenario: deleteNode calls delete API
- **WHEN** `deleteNode(clusterId, nodeId, options)` is called
- **THEN** it SHALL call `DELETE /api/v1/clusters/{clusterId}/nodes/{nodeId}` with delete options

#### Scenario: Batch selection state on cluster
- **WHEN** nodes are checked via the table's row-selection
- **THEN** `selectNodes(cluster, keys, rows)` SHALL set `cluster.selectedNodeKeys = keys`
- **AND** when `keys.length === 1` it SHALL set `cluster.selectedNode = rows[0]`
- **AND** when `keys.length >= 2` it SHALL set `cluster.selectedNode = null`

#### Scenario: Batch selection cleared on search or sort
- **WHEN** the nodes table search conditions (`nodesSearch`/`nodesSearchField`) or sort conditions (`nodesSortBy`/`nodesSortOrder`) change
- **THEN** `selectedNodeKeys` and `selectedNode` SHALL be cleared

#### Scenario: Batch delete with progress
- **WHEN** `deleteNodes(cluster)` is called with multiple checked nodes
- **THEN** the confirmation dialog title SHALL list the selected node IPs (≤3 full, >3 truncated with "等 N 条")
- **AND** the system SHALL call `executeDeleteWithProgress` with the batch endpoint and `resourceKey: { field: 'node_ids', label: '节点', nameField: 'node_ip', keys }`
- **AND** upon completion `selectedNodeKeys` and `selectedNode` SHALL be cleared

#### Scenario: Batch node action executes on selected nodes
- **WHEN** `batchNodeAction(cluster, action, label)` is called with multiple checked nodes
- **THEN** the system SHALL show a confirmation dialog listing the selected node IPs
- **AND** on confirm it SHALL call `POST /api/v1/clusters/{clusterId}/nodes/action` with `{ action, node_ids }`
- **AND** the results SHALL be shown per node (success/failure + error reason)
- **AND** upon completion `selectedNodeKeys`/`selectedNode` SHALL be cleared and the node list refreshed

#### Scenario: Batch node status query shows results table
- **WHEN** `batchNodeStatus(cluster)` is called with multiple checked nodes
- **THEN** the system SHALL call `POST /api/v1/clusters/{clusterId}/nodes/action` with `{ action: 'statistic', node_ids }`
- **AND** the results SHALL be shown in a table with IP, Edge version, health status, and failure reason
- **AND** upon completion the node list SHALL be refreshed
