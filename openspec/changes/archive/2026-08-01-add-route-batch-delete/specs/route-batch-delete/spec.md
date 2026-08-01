## ADDED Requirements

### Requirement: Batch delete routes in cluster detail tab
The system SHALL allow admins to batch-delete multiple routes within a single cluster from the cluster detail page's routes tab.

#### Scenario: Batch delete button with selection
- **WHEN** admin checks more than one route in the routes table of a cluster detail page
- **THEN** the delete button SHALL show as "删除(N)" where N is the number of checked routes
- **THEN** single-selection buttons (复制/编辑/发布/版本管理) SHALL be disabled even if a row is clicked afterwards
- **THEN** the checked routes SHALL remain checked when navigating to a different page (preserveSelectedRowKeys)
- **WHEN** admin searches or sorts the route table
- **THEN** the checked selection SHALL be cleared

#### Scenario: Delete button routes to single delete when no batch selection
- **WHEN** no route is checked but a single route is selected via row click
- **THEN** the delete button SHALL trigger the existing single-route delete flow

#### Scenario: Batch delete with database and edge
- **WHEN** admin confirms batch delete with 数据库 checked
- **THEN** the system SHALL delete the database records (route, route plugins, config versions) for each selected route
- **WHEN** admin confirms batch delete with Edge 节点 checked
- **THEN** the system SHALL sync-delete each route's edge_uuid on the selected active nodes

#### Scenario: Partial failure does not block others
- **WHEN** a batch delete contains a route that fails to delete (e.g. route not found, edge sync error)
- **THEN** the system SHALL continue deleting the remaining routes
- **THEN** the failed route SHALL be reported with its error in the results

#### Scenario: Route without edge_uuid skips edge sync
- **WHEN** a batch delete contains a route with empty or null edge_uuid and delete_edge is requested
- **THEN** the system SHALL skip the edge sync for that route
- **THEN** the route SHALL be reported with status "skipped" in the results

#### Scenario: Progress dialog logs per route
- **WHEN** batch delete is in progress
- **THEN** the progress dialog SHALL log each route's database and per-node edge result (e.g. `删除路由 login-api: 数据库✅ / Edge 10.0.0.1✅`)

#### Scenario: Selection cleared after batch delete
- **WHEN** a batch delete completes successfully
- **THEN** the checked selection (selectedRouteKeys) SHALL be cleared
- **THEN** the single selection (selectedRoute) SHALL be cleared

### Requirement: Confirm dialog lists selected route names
The system SHALL show the names of all selected routes in the batch delete confirmation dialog to prevent mis-deletion.

#### Scenario: Fewer than 4 selected routes listed fully
- **WHEN** admin triggers batch delete with 1-3 routes selected
- **THEN** the confirmation dialog title SHALL list all selected route names

#### Scenario: More than 3 selected routes truncated
- **WHEN** admin triggers batch delete with more than 3 routes selected
- **THEN** the confirmation dialog title SHALL list the first route names followed by "等 N 条" where N is the total count

### Requirement: DNS routes excluded from deletion
The system SHALL prevent DNS-route rows from being deleted in the cluster detail page routes tab, both via batch selection and single deletion.

#### Scenario: DNS route checkbox disabled
- **WHEN** a route has a DNS-related plugin (plugin_name === 'dns_upstream')
- **THEN** its checkbox in the batch selection column SHALL be disabled and uncheckable

#### Scenario: DNS route single delete disabled
- **WHEN** a DNS route is selected and the user attempts to single-delete it
- **THEN** the deletion SHALL be blocked
- **THEN** the user SHALL be informed that DNS query routes are managed in the DNS query page

### Requirement: Batch delete API
The system SHALL provide a batch delete endpoint that deletes multiple routes in one cluster.

#### Scenario: Batch delete request
- **WHEN** a request is sent to `DELETE /clusters/{cluster_id}/routes` with `route_ids`, `delete_db`, `delete_edge`, `node_ids`
- **THEN** the system SHALL validate that at least one of `delete_db` or `delete_edge` is true, otherwise return 400
- **THEN** the system SHALL delete each route following the single-route delete semantics (database rows and/or edge sync per node)
- **THEN** the system SHALL return a message and per-route results grouped by route_id with route_name

#### Scenario: Empty route_ids rejected
- **WHEN** `route_ids` is empty
- **THEN** the system SHALL return a 400 error
