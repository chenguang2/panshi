## ADDED Requirements

### Requirement: User can list built-in plugins
The system SHALL return all available built-in plugins with their schemas.

#### Scenario: List all built-in plugins
- **WHEN** user calls GET /api/v1/plugins/builtin
- **THEN** system returns array of plugin definitions
- **AND** each plugin includes name, description, schema, form_schema

### Requirement: User can get route plugins
The system SHALL return all plugin configurations for a specific route.

#### Scenario: Get route plugins
- **WHEN** user calls GET /api/v1/clusters/{cluster_id}/routes/{route_id}/plugins
- **THEN** system returns array of route plugin configurations
- **AND** each plugin includes id, plugin_name, plugin_config, enabled

#### Scenario: Route with no plugins configured
- **WHEN** route has no plugins
- **THEN** system returns empty array

### Requirement: User can update route plugins
The system SHALL allow users to configure plugins for a route with dual-mode support.

#### Scenario: Update plugins with form data
- **WHEN** user calls PUT with plugins array containing plugin_name and plugin_config objects
- **THEN** system updates or creates each plugin entry
- **AND** returns updated plugins array

#### Scenario: Enable/disable plugin
- **WHEN** user updates plugin with enabled="0"
- **THEN** plugin is marked disabled but configuration is preserved

#### Scenario: Remove plugin by omitting from update
- **WHEN** user updates plugins without a previously configured plugin
- **THEN** that plugin entry is deleted from route

### Requirement: Plugin configuration supports JSON mode
The system SHALL accept and return plugin configurations as JSON objects.

#### Scenario: Update plugin with JSON config
- **WHEN** user provides plugin_config as JSON object (e.g., {"qps": 100, "burst": 50})
- **THEN** system stores and returns exact same JSON structure

#### Scenario: Plugin config is stored as JSON
- **WHEN** plugin configuration is retrieved
- **THEN** plugin_config field is a JSON object, not a string

### Requirement: Plugin schema defines form fields
The system SHALL provide form_schema for each built-in plugin to enable form-based editing.

#### Scenario: Built-in plugin has form schema
- **WHEN** built-in plugin is defined
- **THEN** it includes form_schema with field definitions
- **AND** form_schema defines input types, validation rules, and labels
