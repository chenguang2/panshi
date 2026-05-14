## ADDED Requirements

### Requirement: Backend provides cluster resource statistics

The system SHALL provide a `GET /clusters/{id}/stats` endpoint that returns the count of all associated resources under a cluster.

#### Scenario: Stats endpoint returns correct counts
- **WHEN** a GET request is sent to `/clusters/{id}/stats`
- **THEN** the response SHALL contain `nodes`, `upstreams`, `routes`, `plugin_configs`, `global_rules`, `plugin_metadata`, and `config_versions` counts

### Requirement: Delete endpoint cascades and syncs to Edge nodes

The system SHALL cascade delete all child resources and synchronize deletions to all active Edge nodes when a cluster is deleted.

#### Scenario: Delete cascades to all child resources
- **WHEN** a DELETE request is sent to `/clusters/{id}`
- **THEN** all associated `Upstream`, `Route`, `RoutePlugin`, `Node`, `PluginConfig`, `GlobalRule`, `PluginMetadata`, and `ConfigVersion` records SHALL be deleted

#### Scenario: Delete syncs to active Edge nodes
- **WHEN** a cluster is deleted
- **THEN** the system SHALL iterate all active Edge nodes and call `EdgeClient.delete_route`, `delete_upstream`, `delete_plugin_config`, `delete_global_rule`, and `delete_plugin_metadata` for each resource

### Requirement: Frontend shows resource stats before deletion

The system SHALL display a confirmation dialog listing all resource counts and require the user to type the cluster name before enabling the delete button.

#### Scenario: Stats displayed in confirm dialog
- **WHEN** the user clicks "删除" on a cluster
- **THEN** a modal SHALL display counts of nodes, upstreams, routes, plugin_configs, global_rules, plugin_metadata, and config_versions

#### Scenario: Name confirmation required
- **WHEN** the user attempts to confirm deletion
- **THEN** the confirm button SHALL be disabled until the user types the exact cluster name into an input field

#### Scenario: Progress dialog shows deletion status
- **WHEN** the user confirms deletion
- **THEN** a progress dialog SHALL show the deletion progress with real-time logs (reusing `buildDeleteProgressContent`)
