## ADDED Requirements

### Requirement: ClusterRoutes component
The system SHALL provide a `ClusterRoutes` component that renders the routes tab content.

#### Scenario: Component renders route table
- **WHEN** `ClusterRoutes` receives `cluster` prop
- **THEN** it SHALL render an `a-table` with route name, URI, methods, upstream, priority, status, version, actions columns
- **THEN** it SHALL emit `refresh` when routes are modified
