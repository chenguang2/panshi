## ADDED Requirements

### Requirement: Backend provides config diff API

The system SHALL provide a `GET /clusters/{cluster_id}/nodes/{node_id}/diff` endpoint that compares database configuration against a specific Edge node's running configuration.

#### Scenario: API returns structured diff results
- **WHEN** a GET request is sent to `/clusters/{cluster_id}/nodes/{node_id}/diff`
- **THEN** the response SHALL contain grouped comparisons for upstreams, routes, plugin_configs, global_rules, and plugin_metadata
- **THEN** each group SHALL list items with status: `match`, `mismatch`, `only_in_db`, or `only_in_edge`
- **THEN** mismatched items SHALL include field-level differences

### Requirement: EdgeClient can list all configs

The system SHALL use existing EdgeClient `list_upstreams`, `list_routes`, `list_plugin_configs`, `list_global_rules`, and `list_plugin_metadata` methods to fetch Edge node configurations.

#### Scenario: EdgeClient list methods return parseable data
- **WHEN** `list_upstreams()` is called
- **THEN** it SHALL return a list of upstream config dicts

### Requirement: Frontend has independent diff page

The system SHALL provide a dedicated page at `/clusters/:clusterId/diff/:nodeId` showing the configuration comparison.

#### Scenario: Page shows grouped comparison
- **WHEN** the user navigates to the diff page
- **THEN** the page SHALL display all resource groups with match/mismatch status
- **THEN** the page SHALL have a two-column layout (DB | Edge)

#### Scenario: Mismatched fields are highlighted
- **WHEN** a field value differs between DB and Edge
- **THEN** the differing value SHALL be highlighted in red/with a diff marker

### Requirement: Node operations include diff button

The system SHALL add a "数据库对比" button to each node's operation column in the cluster list.

#### Scenario: Button navigates to diff page
- **WHEN** the user clicks "数据库对比" on a node
- **THEN** the browser SHALL navigate to `/clusters/{cluster_id}/diff/{node_id}`
