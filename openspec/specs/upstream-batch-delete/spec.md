# upstream-batch-delete

## Purpose

单集群内批量删除上游——前端双状态选择（行点击单选 + checkbox 批量）、删除按钮分流、跨页保留、确认弹窗名称列表、批量删除 API 及逐条容错（含关联路由守卫）、批量进度展示。

## Requirements

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

### Requirement: Upstream references precheck endpoint

系统 SHALL 提供只读端点，供前端在批量删除**之前**查询被路由引用的上游，使「跳过提示」与后端删除拦截语义一致。

#### Scenario: 查询指定上游的引用清单
- **WHEN** 请求 `GET /api/v1/clusters/{cluster_id}/upstreams/references?ids=1,2,3`
- **THEN** 系统 SHALL 仅返回**存在引用**的上游，形如 `{ items: [{ upstream_id, upstream_name, routes: [{ route_id, route_name }] }] }`
- **AND** 判定条件 SHALL 与批量删除拦截一致（`Route.upstream_id in ids`）

#### Scenario: 不属于该集群的 id 被忽略
- **WHEN** `ids` 中含其他集群的上游 id 或不存在的 id
- **THEN** 系统 SHALL 返回 200 且该 id SHALL NOT 出现在 `items` 中
- **AND** SHALL NOT 暴露其他集群的信息

#### Scenario: 参数校验
- **WHEN** `ids` 缺失
- **THEN** 系统 SHALL 返回 422
- **WHEN** `ids` 为空串、含非整数或去重后超过 500 个
- **THEN** 系统 SHALL 返回 400

#### Scenario: 端点需要认证
- **WHEN** 未携带有效令牌请求该端点
- **THEN** 系统 SHALL 返回 401

#### Scenario: 前端据此跳过被引用上游
- **WHEN** 用户批量删除上游，其中部分被路由引用
- **THEN** 前端 SHALL 在打开确认框前调用该端点，把被引用项从待删列表剔除
- **AND** 确认框 SHALL 明示「已跳过 N 条被路由引用的上游」
- **WHEN** 全部选中项都被引用
- **THEN** 前端 SHALL 只提示且 SHALL NOT 打开确认框、SHALL NOT 发送删除请求
