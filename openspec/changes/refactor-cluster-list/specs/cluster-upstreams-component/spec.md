## ADDED Requirements

### Requirement: ClusterUpstreams component
The system SHALL provide a `ClusterUpstreams` component that renders the upstreams tab content.

#### Scenario: Component renders upstream table
- **WHEN** `ClusterUpstreams` receives `cluster` prop
- **THEN** it SHALL render an `a-table` with upstream name, load balance, targets, version, actions columns
- **THEN** it SHALL emit `refresh` when upstreams are modified
