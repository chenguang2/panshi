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
