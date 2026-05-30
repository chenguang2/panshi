# node-action-progress-dialog Specification

## Purpose
Node action execution progress dialog, showing commands and results in a modal.

## Requirements

### Requirement: Node action executes with progress dialog

When the user clicks "启动", "停止", or "状态查询" on a node, the system SHALL display a modal dialog showing execution progress, commands, and results, following the same pattern as the route publish dialog (`executePublish`).

#### Scenario: Start node shows progress dialog
- **WHEN** the user clicks "启动" on a node
- **THEN** a modal dialog SHALL open with "节点 启动" as title
- **THEN** the dialog SHALL display a progress bar and a scrollable log area
- **THEN** the "确定" button SHALL be disabled during execution
- **THEN** the dialog SHALL show the full ansible-playbook command
- **THEN** the dialog SHALL show the return code (rc)
- **THEN** the dialog SHALL extract and display key information from stdout (Nginx process status, PID)
- **THEN** the dialog SHALL show the full stdout and stderr
- **THEN** the dialog SHALL show either "✅ 节点 启动 成功" or "❌ 节点 启动 失败"
- **THEN** on success or failure, the "确定" button SHALL be enabled
- **AND** the node table SHALL be refreshed after completion

#### Scenario: Stop node shows progress dialog
- **WHEN** the user clicks "停止" on a node
- **THEN** the same dialog pattern SHALL apply with action "停止"

#### Scenario: Status query shows progress dialog
- **WHEN** the user clicks "状态查询" on a node
- **THEN** the dialog SHALL show "正在执行 edge_statistic..." as log
- **THEN** the dialog SHALL display parsed node statistics (CPU usage, memory usage, Edge version)

#### Scenario: Action failure shows error
- **WHEN** the API call fails or returns non-zero rc
- **THEN** the dialog SHALL show "❌" and the error message
- **THEN** the "确定" button SHALL be enabled for dismissal
