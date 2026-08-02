## MODIFIED Requirements

### Requirement: ClusterNodes component
The system SHALL provide a `ClusterNodes` component that renders the nodes tab content.

#### Scenario: Component renders node table
- **WHEN** `ClusterNodes` receives `cluster` prop
- **THEN** it SHALL render an `a-table` with node IP, ports, status, actions columns
- **THEN** it SHALL emit `refresh` when nodes are modified

#### Scenario: Row actions include copy
- **WHEN** the node table renders action buttons for a row
- **THEN** a 复制 button SHALL be available alongside 编辑/删除/启动/停止
- **AND** clicking it SHALL trigger the copy-node flow (open add modal with template pre-filled)

#### Scenario: Add modal supports batch import mode
- **WHEN** the admin opens the add node modal
- **THEN** the modal SHALL offer mode switching between 单个添加 and 批量导入
- **AND** in batch import mode it SHALL provide text paste and CSV upload tabs, a preview table, and a 创建 N 个节点 submit button

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

#### Scenario: Action buttons support batch mode
- **WHEN** `selectedNodeKeys.length > 1`
- **THEN** the toolbar action buttons (启动/停止/reload/状态查询) SHALL show with a count suffix (e.g. "启动(2)")
- **AND** clicking them SHALL trigger the batch operation on all checked nodes
- **AND** the 编辑 button SHALL remain disabled (single-node only)
- **WHEN** `selectedNodeKeys.length <= 1`
- **THEN** the toolbar action buttons SHALL trigger the existing single-node operations
