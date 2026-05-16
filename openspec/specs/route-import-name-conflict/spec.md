# Route Import Name Conflict

## Purpose

定义路由导入时名称冲突的处理策略，确保同名路由不会静默丢失，而是自动重命名后导入。

## Requirements

### Requirement: Route import SHALL resolve name conflicts by renaming

When importing routes from an Edge node, if a route's `name` already exists in the database for the same cluster, the system SHALL automatically rename it with a `-imported-{n}` suffix instead of skipping it.

#### Scenario: Route name conflicts are resolved with suffix
- **WHEN** importing a route whose `name` matches an existing route name in the same cluster
- **THEN** the system SHALL add a `-imported-1` suffix to the route's `name` (incrementing if `-imported-1` also conflicts)
- **AND** the route SHALL be imported with the new name
- **AND** existing routes SHALL NOT be modified

#### Scenario: Route name conflict resolution follows same logic as upstream
- **WHEN** resolving a route name conflict during import
- **THEN** the system SHALL reuse the `_resolve_upstream_name` method (same as upstream name conflict resolution)
