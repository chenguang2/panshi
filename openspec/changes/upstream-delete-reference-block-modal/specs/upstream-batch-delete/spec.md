## MODIFIED Requirements

### Requirement: Upstreams referenced by routes excluded from deletion
The system SHALL prevent upstreams that are referenced by routes (r.upstream_id === upstream.id) from being deleted in the cluster detail page upstreams tab, both via batch selection and single deletion.

#### Scenario: Referenced upstream filtered out with warning in batch delete
- **WHEN** a batch delete contains an upstream that is referenced by at least one route
- **THEN** the system SHALL remove that upstream from the pending deletion list before showing the confirmation dialog
- **THEN** the confirmation dialog SHALL carry a blocking notice naming the skipped upstreams together with their referencing route names (each upstream lists at most 3 route names, folded as "等 N 条")
- **THEN** only non-referenced upstreams SHALL appear in the confirmation dialog title and be sent in the batch request
- **THEN** the remaining upstreams SHALL continue to be deleted

#### Scenario: All selected upstreams referenced - no dialog
<!-- 2026-11-22 用户裁决（upstream-delete-reference-block-modal）：行为反转——由「仅 toast 提示」改为「阻断弹窗」。场景标题按 openspec 约定保留（场景名是稳定标识符，不可重命名），正文已改写为弹窗语义。 -->
- **WHEN** every upstream in the batch selection is referenced by routes
- **THEN** the system SHALL show a blocking dialog (overlay modal) instead of a transient toast
- **THEN** the dialog title SHALL state that deletion is not possible because the upstreams are still referenced by routes
- **THEN** the dialog body SHALL list each blocked upstream together with the names of the routes referencing it (at most 3 route names per upstream, folded as "等 N 条")
- **THEN** the dialog SHALL only offer a single acknowledge action and SHALL NOT expose any delete entry
- **THEN** no delete confirmation dialog SHALL open and no delete request SHALL be sent
- **WHEN** every upstream in the batch selection is referenced by routes
- **THEN** the system SHALL show a blocking dialog (overlay modal) instead of a transient toast
- **THEN** the dialog title SHALL state that deletion is not possible because the upstreams are still referenced by routes
- **THEN** the dialog body SHALL list each blocked upstream together with the names of the routes referencing it (at most 3 route names per upstream, folded as "等 N 条")
- **THEN** the dialog SHALL only offer a single acknowledge action and SHALL NOT expose any delete entry
- **THEN** no delete confirmation dialog SHALL open and no delete request SHALL be sent

#### Scenario: Referenced upstream blocked by backend regardless of delete_db/delete_edge
- **WHEN** a batch delete request contains an upstream referenced by routes, with any combination of delete_db/delete_edge
- **THEN** the backend SHALL mark that upstream as failed with an error explaining that the referencing routes must be deleted first
- **THEN** the remaining upstreams SHALL continue to be deleted

#### Scenario: Referenced upstream single delete blocked
- **WHEN** an upstream referenced by routes is selected and the user attempts to single-delete it
- **THEN** the deletion SHALL be blocked
- **THEN** the user SHALL be informed that the referencing routes must be deleted first
