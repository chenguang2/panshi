## ADDED Requirements

### Requirement: Backend provides config diff API

The system SHALL provide a `GET /clusters/{cluster_id}/nodes/{node_id}/diff` endpoint that compares database configuration against a specific Edge node's running configuration.

#### Scenario: API returns structured diff results
- **WHEN** a GET request is sent to `/clusters/{cluster_id}/nodes/{node_id}/diff`
- **THEN** the response SHALL contain grouped comparisons for upstreams, routes, plugin_configs, global_rules, and plugin_metadata
- **THEN** each group SHALL list items with status: `match`, `mismatch`, `only_in_db`, or `only_in_edge`
- **THEN** mismatched items SHALL include field-level differences
- **THEN** route comparison SHALL include `vars` (advanced match), `plugin_config_ids`, and per-plugin `plugins`
- **THEN** plugin metadata SHALL be keyed by plugin name from the Edge node key path

### Requirement: EdgeClient can list all configs

The system SHALL use existing EdgeClient `list_upstreams`, `list_routes`, `list_plugin_configs`, `list_global_rules`, and `list_plugin_metadata` methods to fetch Edge node configurations.

#### Scenario: EdgeClient list methods return parseable data
- **WHEN** `list_upstreams()` is called
- **THEN** it SHALL return a list of upstream config dicts

### Requirement: Frontend shows diff in Drawer

The system SHALL provide a Drawer panel on the cluster list page showing configuration comparison, with field-level differences expanded inline below each mismatched row.

#### Scenario: Mismatched items expand inline
- **WHEN** the user clicks "查看差异" on a mismatched row
- **THEN** the field-level comparison SHALL expand directly below that row
- **THEN** expanding another row SHALL NOT affect previously expanded rows

#### Scenario: Mismatched fields are highlighted
- **WHEN** a field value differs between DB and Edge
- **THEN** the differing value SHALL be highlighted in red/with a diff marker

### Requirement: Node operations include diff button

The system SHALL add a "数据库对比" button to each node's operation column in the cluster list.

#### Scenario: Button opens diff drawer
- **WHEN** the user clicks "数据库对比" on a node
- **THEN** a Drawer panel SHALL open on the right side of the cluster list page
- **THEN** the Drawer SHALL show configuration comparison for that node

### Requirement: Equivalence rules reduce false mismatches

The system SHALL use the EquivalenceRules engine to normalize DB and Edge values before comparison, reducing false mismatch reports caused by missing defaults.

#### Scenario: load_balance field is properly mapped
- **WHEN** DB upstream has `load_balance="weighted_roundrobin"` and Edge has `type="roundrobin"`
- **THEN** they SHALL be considered equivalent (not shown as mismatch)

#### Scenario: DB comma strings match Edge arrays
- **WHEN** DB stores `methods="GET,POST"` and Edge stores `methods=["GET","POST"]`
- **THEN** they SHALL be considered equivalent
