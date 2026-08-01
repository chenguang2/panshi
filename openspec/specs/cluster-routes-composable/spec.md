# cluster-routes-composable Specification

## Purpose
TBD - created by archiving change add-route-batch-delete. Update Purpose after archive.
## Requirements
### Requirement: useClusterRoutes composable
The system SHALL provide a `useClusterRoutes` composable that encapsulates all route related state and operations, including batch selection and batch delete.

#### Scenario: Composable returns reactive state
- **WHEN** `useClusterRoutes(cluster)` is called
- **THEN** it SHALL return `{ routes, routesLoading, routesPagination, routesSearch, loadRoutes, deleteRoute, deleteRoutes, editRoute, addRoute, copyRoute, publishRoute, saveRoute, openRouteVersionManagement, loadRoutePlugins, selectRoutes }`

#### Scenario: selectRoutes syncs dual selection states
- **WHEN** `selectRoutes(cluster, keys, rows)` is called with the checkbox selection change
- **THEN** `cluster.selectedRouteKeys` SHALL be set to the checked keys
- **THEN** when exactly one key is checked, `cluster.selectedRoute` SHALL be set to that row
- **THEN** when two or more keys are checked, `cluster.selectedRoute` SHALL be set to null

#### Scenario: deleteRoutes performs batch delete
- **WHEN** `deleteRoutes(cluster)` is called with two or more routes checked
- **THEN** it SHALL open the delete confirmation dialog with the selected route names in the title
- **THEN** on confirmation it SHALL call the batch delete endpoint with `route_ids`
- **THEN** it SHALL display per-route progress via `executeDeleteWithProgress`
- **THEN** on completion it SHALL clear both `selectedRouteKeys` and `selectedRoute` via `clearSelectedFn`

#### Scenario: deleteRoutes guards DNS routes
- **WHEN** `deleteRoutes(cluster)` is called and the selection contains a DNS route (plugin_name === 'dns_upstream')
- **THEN** it SHALL block the deletion and inform the user that DNS query routes are managed in the DNS query page

#### Scenario: single delete guards DNS routes
- **WHEN** the single delete flow (`deleteRoute`/`deleteRouteByRecord`) targets a DNS route
- **THEN** the deletion SHALL be blocked with the same DNS route message
