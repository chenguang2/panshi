## MODIFIED Requirements

### Requirement: Backend provides config diff API

The system SHALL provide a `GET /clusters/{cluster_id}/nodes/{node_id}/diff` endpoint that compares database configuration against a specific Edge node's running configuration.

#### Scenario: Route comparison includes advanced match and plugins
- **WHEN** comparing a route with `vars` (advanced match), `plugin_config_ids`, and `plugins`
- **THEN** these fields SHALL be included in the comparison results

#### Scenario: Plugin metadata key is correctly extracted
- **WHEN** listing plugin metadata from Edge
- **THEN** the plugin name SHALL be extracted from the node's key path (e.g., `/edge/plugin_metadata/log_process` → `log_process`)

#### Scenario: Plugin metadata comparison uses raw edge data
- **WHEN** comparing plugin metadata config
- **THEN** the Edge value SHALL be used directly, not wrapped in a `config` key
