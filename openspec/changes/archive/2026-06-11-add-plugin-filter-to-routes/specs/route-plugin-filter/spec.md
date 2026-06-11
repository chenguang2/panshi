## ADDED Requirements

### Requirement: Route list page SHALL provide a plugin dropdown filter
The route management list page SHALL provide a "插件" dropdown filter in the filter bar, allowing users to filter the route list by the plugin name mounted on each route.

#### Scenario: Filter routes by a specific plugin
- **WHEN** user selects a plugin name (e.g., "limit-req") from the plugin dropdown filter
- **THEN** the route list SHALL be filtered to show only routes that have the selected plugin mounted

#### Scenario: Plugin dropdown shows all available plugins
- **WHEN** the route list page loads
- **THEN** the plugin dropdown SHALL populate its options from the `/plugins/builtin` API response
- **AND** the dropdown SHALL include a default option representing "all plugins" (no filter)
- **AND** each option's value SHALL use the `name` field (e.g., `"limit-req"`)
- **AND** each option's display label SHALL use the `display_name` field, falling back to `name` if `display_name` is absent

#### Scenario: Plugin filter is independent of cluster filter
- **WHEN** user changes the cluster filter while a plugin filter is active
- **THEN** the plugin dropdown selection SHALL remain unchanged
- **AND** the plugin filter parameter SHALL still be sent in the API request

#### Scenario: Clear plugin filter
- **WHEN** user selects the "全部" option in the plugin dropdown (or clears the selection)
- **THEN** the route list SHALL revert to showing all routes without plugin filtering

### Requirement: Backend API SHALL support plugin query parameter
The route listing API endpoint (`GET /api/v1/routes`) SHALL accept an optional `plugin` query parameter to filter routes by plugin name.

#### Scenario: Filter routes by plugin via API
- **WHEN** a GET request is made to `/api/v1/routes?plugin=limit-req`
- **THEN** the response SHALL include only routes that have a `route_plugin` record with `plugin_name = 'limit-req'`
- **AND** the pagination metadata (`total`) SHALL reflect the filtered count

#### Scenario: No plugin parameter returns all routes
- **WHEN** a GET request is made to `/api/v1/routes` without a `plugin` parameter
- **THEN** the response SHALL include all routes (existing behavior unchanged)
