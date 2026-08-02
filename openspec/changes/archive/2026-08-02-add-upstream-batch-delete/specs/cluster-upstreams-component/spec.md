## MODIFIED Requirements

### Requirement: ClusterUpstreams component
The system SHALL provide a `ClusterUpstreams` component that renders the upstreams tab content.

#### Scenario: Component renders upstream table
- **WHEN** `ClusterUpstreams` receives `cluster` prop
- **THEN** it SHALL render an `a-table` with upstream name, load balance, targets, version, actions columns
- **THEN** it SHALL emit `refresh` when upstreams are modified

#### Scenario: Multi-select row selection with row-click single select
- **WHEN** the upstreams table is rendered
- **THEN** the table SHALL use multi-select row-selection bound to `cluster.selectedUpstreamKeys`
- **AND** `preserveSelectedRowKeys` SHALL be enabled so checked upstreams persist across pages
- **AND** row click (`customRow` onClick) SHALL set `cluster.selectedUpstream` to the clicked record

#### Scenario: Delete button dispatches to batch or single delete
- **WHEN** `selectedUpstreamKeys.length > 0`
- **THEN** the delete button SHALL show "删除上游(N)" where N is the checked count
- **AND** clicking it SHALL trigger `deleteUpstreams(cluster)`
- **WHEN** `selectedUpstreamKeys.length === 0` and a single upstream is selected
- **THEN** the delete button SHALL trigger the existing single-upstream delete flow
- **AND** single-selection buttons (编辑/发布/版本管理) SHALL be disabled when `selectedUpstreamKeys.length >= 2` even if a row is clicked afterwards
