## MODIFIED Requirements

### Requirement: ClusterNodes component
The system SHALL provide a `ClusterNodes` component that renders the nodes tab content.

#### Scenario: Component renders node table
- **WHEN** `ClusterNodes` receives `cluster` prop
- **THEN** it SHALL render an `a-table` with node IP, ports, status, actions columns
- **THEN** it SHALL emit `refresh` when nodes are modified

#### Scenario: Multi-select row selection with row-click single select
- **WHEN** the nodes table is rendered
- **THEN** the table SHALL use multi-select row-selection bound to `cluster.selectedNodeKeys`
- **AND** `preserveSelectedRowKeys` SHALL be enabled so checked nodes persist across pages
- **AND** row click (`customRow` onClick) SHALL set `cluster.selectedNode` to the clicked record

#### Scenario: Delete button dispatches to batch or single delete
- **WHEN** `selectedNodeKeys.length > 0`
- **THEN** the delete button SHALL show "删除节点(N)" where N is the checked count
- **AND** clicking it SHALL trigger `deleteNodes(cluster)`
- **WHEN** `selectedNodeKeys.length === 0` and a single node is selected
- **THEN** the delete button SHALL trigger the existing single-node delete flow
- **AND** single-selection buttons (编辑/启动/停止/状态查询) SHALL be disabled when `selectedNodeKeys.length >= 2` even if a row is clicked afterwards
