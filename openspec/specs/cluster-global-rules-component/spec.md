## ADDED Requirements

### Requirement: ClusterGlobalRules component
The system SHALL provide a `ClusterGlobalRules` component that renders the global rules tab content.

#### Scenario: Component renders global rule list
- **WHEN** `ClusterGlobalRules` receives `cluster` prop
- **THEN** it SHALL render global rule cards with description, plugins, actions
- **THEN** it SHALL emit `refresh` when global rules are modified
