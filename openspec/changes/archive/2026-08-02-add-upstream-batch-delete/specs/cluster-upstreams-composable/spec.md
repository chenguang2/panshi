## MODIFIED Requirements

### Requirement: useClusterUpstreams composable
The system SHALL provide a `useClusterUpstreams` composable that encapsulates all upstream related state and operations.

#### Scenario: Composable returns reactive state
- **WHEN** `useClusterUpstreams(cluster)` is called
- **THEN** it SHALL return `{ upstreams, upstreamsLoading, upstreamsPagination, loadUpstreams, deleteUpstream, deleteUpstreams, editUpstream, addUpstream, publishUpstream, publishUpstreamByRecord, openUpstreamVersionManagement }`

#### Scenario: Batch selection state on cluster
- **WHEN** upstreams are checked via the table's row-selection
- **THEN** `selectUpstreams(cluster, keys, rows)` SHALL set `cluster.selectedUpstreamKeys = keys`
- **AND** when `keys.length === 1` it SHALL set `cluster.selectedUpstream = rows[0]`
- **AND** when `keys.length >= 2` it SHALL set `cluster.selectedUpstream = null`

#### Scenario: Batch selection cleared on search or sort
- **WHEN** the upstreams table search conditions (`upstreamsSearch`/`upstreamsSearchField`) or sort conditions (`upstreamsSortBy`/`upstreamsSortOrder`) change
- **THEN** `selectedUpstreamKeys` and `selectedUpstream` SHALL be cleared

#### Scenario: Batch delete with linked-route guard (filter-out + warn)
- **WHEN** `deleteUpstreams(cluster)` is called with multiple checked upstreams
- **THEN** the system SHALL check each upstream for routes referencing it (`r.upstream_id === upstream.id`)
- **AND** referenced upstreams SHALL be removed from the pending deletion list and the user SHALL be warned via message
- **AND** only non-referenced upstreams SHALL appear in the confirmation dialog title (≤3 full, >3 truncated with "等 N 条") and be sent via `executeDeleteWithProgress` with the batch endpoint
- **AND** when all selected upstreams are referenced, the system SHALL warn without opening the confirmation dialog
- **AND** upon completion `selectedUpstreamKeys` and `selectedUpstream` SHALL be cleared
