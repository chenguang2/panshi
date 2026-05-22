## ADDED Requirements

### Requirement: ClusterPluginConfigs component
The system SHALL provide a `ClusterPluginConfigs` component that renders the plugin configs tab content.

#### Scenario: Component renders plugin config list
- **WHEN** `ClusterPluginConfigs` receives `cluster` prop
- **THEN** it SHALL render plugin config cards/table with name, plugins count, version, actions
- **THEN** it SHALL emit `refresh` when plugin configs are modified
