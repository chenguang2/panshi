## ADDED Requirements

### Requirement: Batch delete upstreams in cluster detail tab
The system SHALL allow admins to batch-delete multiple upstreams within a single cluster from the cluster detail page's upstreams tab.

#### Scenario: Batch delete button with selection
- **WHEN** admin checks more than one upstream in the upstreams table of a cluster detail page
- **THEN** the delete button SHALL show as "删除上游(N)" where N is the number of checked upstreams
- **THEN** single-selection buttons (编辑/发布/版本管理) SHALL be disabled even if a row is clicked afterwards
- **THEN** the checked upstreams SHALL remain checked when navigating to a different page (preserveSelectedRowKeys)
- **WHEN** admin searches or sorts the upstreams table
- **THEN** the checked selection SHALL be cleared

#### Scenario: Delete button routes to single delete when no batch selection
- **WHEN** no upstream is checked but a single upstream is selected via row click
- **THEN** the delete button SHALL trigger the existing single-upstream delete flow

#### Scenario: Batch delete with database and edge
- **WHEN** admin confirms batch delete with 数据库 checked
- **THEN** the system SHALL delete the database records (upstream, upstream targets, config versions) for each selected upstream
- **WHEN** admin confirms batch delete with Edge 节点 checked
- **THEN** the system SHALL sync-delete each upstream's edge_uuid on the selected active nodes

#### Scenario: Partial failure does not block others
- **WHEN** a batch delete contains an upstream that fails to delete (e.g. upstream not found, edge sync error)
- **THEN** the system SHALL continue deleting the remaining upstreams
- **THEN** the failed upstream SHALL be reported with its error in the results

#### Scenario: Upstream without edge_uuid skips edge sync
- **WHEN** a batch delete contains an upstream with empty or null edge_uuid and delete_edge is requested
- **THEN** the system SHALL skip the edge sync for that upstream
- **THEN** the upstream SHALL be reported with status "skipped" in the results

#### Scenario: Progress dialog logs per upstream
- **WHEN** batch delete is in progress
- **THEN** the progress dialog SHALL log each upstream's database and per-node edge result (e.g. `删除上游 login-api: 数据库✅ / Edge 10.0.0.1✅`)

#### Scenario: Selection cleared after batch delete
- **WHEN** a batch delete completes successfully
- **THEN** the checked selection (selectedUpstreamKeys) SHALL be cleared
- **THEN** the single selection (selectedUpstream) SHALL be cleared

### Requirement: Confirm dialog lists selected upstream names
The system SHALL show the names of all selected upstreams in the batch delete confirmation dialog to prevent mis-deletion.

#### Scenario: Fewer than 4 selected upstreams listed fully
- **WHEN** admin triggers batch delete with 1-3 upstreams selected
- **THEN** the confirmation dialog title SHALL list all selected upstream names

#### Scenario: More than 3 selected upstreams truncated
- **WHEN** admin triggers batch delete with more than 3 upstreams selected
- **THEN** the confirmation dialog title SHALL list the first upstream names followed by "等 N 条" where N is the total count

### Requirement: Upstreams referenced by routes excluded from deletion
The system SHALL prevent upstreams that are referenced by routes (r.upstream_id === upstream.id) from being deleted in the cluster detail page upstreams tab, both via batch selection and single deletion.

#### Scenario: Referenced upstream filtered out with warning in batch delete
- **WHEN** a batch delete contains an upstream that is referenced by at least one route
- **THEN** the system SHALL remove that upstream from the pending deletion list before showing the confirmation dialog
- **THEN** the user SHALL be warned via message that the upstream was skipped because it is referenced by routes
- **THEN** only non-referenced upstreams SHALL appear in the confirmation dialog title and be sent in the batch request
- **THEN** the remaining upstreams SHALL continue to be deleted

#### Scenario: All selected upstreams referenced - no dialog
- **WHEN** every upstream in the batch selection is referenced by routes
- **THEN** the system SHALL show the warning without opening the confirmation dialog
- **THEN** no delete request SHALL be sent

#### Scenario: Referenced upstream blocked by backend regardless of delete_db/delete_edge
- **WHEN** a batch delete request contains an upstream referenced by routes, with any combination of delete_db/delete_edge
- **THEN** the backend SHALL mark that upstream as failed with an error explaining that the referencing routes must be deleted first
- **THEN** the remaining upstreams SHALL continue to be deleted

#### Scenario: Referenced upstream single delete blocked
- **WHEN** an upstream referenced by routes is selected and the user attempts to single-delete it
- **THEN** the deletion SHALL be blocked
- **THEN** the user SHALL be informed that the referencing routes must be deleted first

### Requirement: Batch delete API
The system SHALL provide a batch delete endpoint that deletes multiple upstreams in one cluster.

#### Scenario: Batch delete request
- **WHEN** a request is sent to `DELETE /clusters/{cluster_id}/upstreams` with `upstream_ids`, `delete_db`, `delete_edge`, `node_ids`
- **THEN** the system SHALL validate that at least one of `delete_db` or `delete_edge` is true, otherwise return 400
- **THEN** the system SHALL validate that `upstream_ids` is not empty, otherwise return 400
- **THEN** the system SHALL delete each upstream following the single-upstream delete semantics (database rows and/or edge sync per node)
- **THEN** the system SHALL return a message and per-upstream results grouped by upstream_id with upstream_name

#### Scenario: Empty upstream_ids rejected
- **WHEN** `upstream_ids` is empty
- **THEN** the system SHALL return a 400 error

#### Scenario: Database error in one item does not break the batch
- **WHEN** a database operation fails mid-transaction for one upstream (before commit)
- **THEN** the session SHALL be rolled back for that item
- **THEN** the failed upstream SHALL be reported with its error in the results
- **THEN** the remaining upstreams SHALL still be deletable (no PendingRollbackError cascade)

#### Scenario: Single upstream delete also skips empty edge_uuid
- **WHEN** `DELETE /clusters/{cluster_id}/upstreams/{upstream_id}` is called with `delete_edge` and the upstream has empty or null edge_uuid
- **THEN** the system SHALL skip the edge sync for that upstream
- **THEN** the result SHALL report `{"scope": "edge", "status": "skipped"}` instead of sending a collection-level DELETE to the Edge node
