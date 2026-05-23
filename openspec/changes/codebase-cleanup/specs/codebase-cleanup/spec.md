## ADDED Requirements

### Requirement: Fix missing StaticResource model registration
The system SHALL register the `StaticResource` model in `models/__init__.py` so that `init_db()` creates the `ps_static_resource` table.

#### Scenario: Database initialization creates static_resource table
- **WHEN** `init_db()` is called
- **THEN** the `ps_static_resource` table SHALL exist in the database

### Requirement: Fix copy-paste bug in delete_plugin_config
The `delete_plugin_config` endpoint in `clusters.py` SHALL use `config_id` and `config` variables instead of the incorrectly copied `upstream_id` and `upstream`.

#### Scenario: Delete plugin config succeeds
- **WHEN** calling `DELETE /clusters/{id}/plugin_configs/{config_id}`
- **THEN** it SHALL delete the plugin config record and its version history
- **THEN** it SHALL NOT reference undefined variables

### Requirement: Remove dead components and assets
The system SHALL remove 3 unused components (`HelloWorld.vue`, `TwoColumnPluginSelector.vue`, `DraggablePluginGrid.vue`) and 3 unused asset files.

#### Scenario: Dead components removed
- **WHEN** searching for imports of any of these components across the codebase
- **THEN** no imports SHALL be found

### Requirement: Merge duplicate utility functions
The system SHALL merge `buildDeleteProgressContent` (4 copies), `formatDate` (5 copies), and `getClusterUpstreams` (3 copies) into shared locations.

#### Scenario: Shared functions used consistently
- **WHEN** grep for `function buildDeleteProgressContent`
- **THEN** it SHALL appear in exactly 1 file (useClusterUtils.ts)
- **WHEN** grep for `function formatDate`
- **THEN** it SHALL appear in exactly 1 file (useClusterUtils.ts)
