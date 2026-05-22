## ADDED Requirements

### Requirement: ClusterNodes component
The system SHALL provide a `ClusterNodes` component that renders the nodes tab content.

#### Scenario: Component renders node table
- **WHEN** `ClusterNodes` receives `cluster` prop
- **THEN** it SHALL render an `a-table` with node IP, ports, status, actions columns
- **THEN** it SHALL emit `refresh` when nodes are modified
