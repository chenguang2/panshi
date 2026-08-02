## MODIFIED Requirements

### Requirement: useClusterNodes composable
The system SHALL provide a `useClusterNodes` composable that encapsulates all cluster node related state and operations.

#### Scenario: Composable returns reactive state
- **WHEN** `useClusterNodes(cluster)` is called
- **THEN** it SHALL return `{ nodes, nodesLoading, nodesPagination, nodesSearch, nodesSearchField, nodesSortBy, nodesSortOrder, loadNodes, deleteNode, editNode, addNode, publishNode, openNodeVersionManagement, loadNodeStatus, startNode, stopNode, copyNode, parseIpList, parseNodeCsv, importNodes }`

#### Scenario: loadNodes fetches from API
- **WHEN** `loadNodes(clusterId)` is called
- **THEN** it SHALL call `GET /api/v1/clusters/{clusterId}/nodes` with pagination and search params
- **THEN** it SHALL update `nodes`, `nodesPagination` reactive refs

#### Scenario: deleteNode calls delete API
- **WHEN** `deleteNode(clusterId, nodeId, options)` is called
- **THEN** it SHALL call `DELETE /api/v1/clusters/{clusterId}/nodes/{nodeId}` with delete options

#### Scenario: copyNode opens add modal with template
- **WHEN** `copyNode(cluster, node)` is called
- **THEN** the add modal SHALL open in single-add mode with the node's fields pre-filled except ip
- **AND** the modal title SHALL indicate 复制节点

#### Scenario: importNodes calls batch API
- **WHEN** `importNodes(cluster, rows)` is called with valid node rows
- **THEN** it SHALL call `POST /api/v1/clusters/{clusterId}/nodes/batch` with the nodes
- **THEN** on success it SHALL refresh the node list via `loadNodes`
