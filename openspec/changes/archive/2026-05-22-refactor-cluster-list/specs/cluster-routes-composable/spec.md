## ADDED Requirements

### Requirement: useClusterRoutes composable
The system SHALL provide a `useClusterRoutes` composable that encapsulates all route related state and operations.

#### Scenario: Composable returns reactive state
- **WHEN** `useClusterRoutes(cluster)` is called
- **THEN** it SHALL return `{ routes, routesLoading, routesPagination, routesSearch, loadRoutes, deleteRoute, editRoute, addRoute, copyRoute, publishRoute, saveRoute, openRouteVersionManagement, loadRoutePlugins }`
