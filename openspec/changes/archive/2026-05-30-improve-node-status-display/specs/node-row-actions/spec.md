## MODIFIED Requirements

### Requirement: Start node button shows progress dialog

The "启动" button SHALL show a progress dialog instead of a simple message.

**Context**: Previously the button only called `message.success()`. Now it SHALL open a full progress dialog.

#### Scenario: Start with progress dialog
- **WHEN** the user clicks the "启动" button
- **THEN** a progress dialog SHALL open (see `node-action-progress-dialog` spec)
- **THEN** after completion, the node list SHALL be refreshed

### Requirement: Stop node button shows progress dialog

The "停止" button SHALL show a progress dialog instead of a simple message.

#### Scenario: Stop with progress dialog
- **WHEN** the user clicks the "停止" button
- **THEN** a progress dialog SHALL open (see `node-action-progress-dialog` spec)
- **THEN** after completion, the node list SHALL be refreshed

### Requirement: Status query executes edge_statistic

The "状态查询" button SHALL execute `edge_statistic` via `POST /nodes/{id}/statistic` and display results in a progress dialog, instead of only reading `GET /nodes/{id}/status` from the database.

#### Scenario: Status query with progress dialog
- **WHEN** the user clicks the "状态查询" button
- **THEN** a progress dialog SHALL open showing the execution process
- **THEN** the dialog SHALL display parsed node statistics
- **THEN** after completion, the node list SHALL be refreshed
