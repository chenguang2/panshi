# Unified Edge Client

## Purpose

Replace 29 individual resource-specific methods in `EdgeClient` with a single generic `api()` method using resource/action mappings.

## ADDED Requirements

### Requirement: Single api method
`EdgeClient` SHALL provide a single `api(resource, action, resource_id=None, data=None)` method that replaces all 29 existing resource-specific methods (like `get_upstream`, `update_route`, `delete_plugin_config`).

#### Scenario: All EdgeClient calls use unified api method
- **WHEN** any endpoint calls `client.get_upstream(id)` or `client.update_route(uuid, data)`
- **THEN** it calls `client.api('upstream', 'get', id)` or `client.api('route', 'update', uuid, data)` instead
- **THEN** the URL path is constructed from `RESOURCE_PATHS` mapping
- **THEN** the HTTP method is determined by `action → method` mapping

### Requirement: Backward-compatible aliases
Old method names SHALL be kept as thin wrappers that delegate to `api()`.

#### Scenario: Old method names still work
- **WHEN** `client.update_route(uuid, data)` is called
- **THEN** it delegates to `self.api('route', 'update', uuid, data)`
## Requirements
### Requirement: Single resource_request method
`EdgeClient` SHALL provide a single `api(resource, action, resource_id=None, data=None)` method that replaces all 29 existing resource-specific methods (like `get_upstream`, `update_route`, `delete_plugin_config`).

#### Scenario: All EdgeClient calls use unified api method
- **WHEN** any endpoint calls `client.get_upstream(id)` or `client.update_route(uuid, data)`
- **THEN** it calls `client.api('upstream', 'get', id)` or `client.api('route', 'update', uuid, data)` instead
- **THEN** the URL path is constructed from `RESOURCE_PATHS` mapping
- **THEN** the HTTP method is determined by `action → method` mapping

### Requirement: Backward-compatible aliases
Old method names SHALL be kept as thin wrappers that delegate to `api()`.

#### Scenario: Old method names still work
- **WHEN** `client.update_route(uuid, data)` is called
- **THEN** it delegates to `self.api('route', 'update', uuid, data)`

