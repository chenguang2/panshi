## ADDED Requirements

### Requirement: useClusterUpstreams composable
The system SHALL provide a `useClusterUpstreams` composable that encapsulates all upstream related state and operations.

#### Scenario: Composable returns reactive state
- **WHEN** `useClusterUpstreams(cluster)` is called
- **THEN** it SHALL return `{ upstreams, upstreamsLoading, upstreamsPagination, loadUpstreams, deleteUpstream, editUpstream, addUpstream, publishUpstream, publishUpstreamByRecord, openUpstreamVersionManagement }`
