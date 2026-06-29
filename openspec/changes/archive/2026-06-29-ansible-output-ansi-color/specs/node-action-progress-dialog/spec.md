# node-action-progress-dialog Specification

## Purpose
Node action execution progress dialog, showing commands and results in a Drawer with Tab-based organization.

## MODIFIED Requirements

### Requirement: Node action executes with progress dialog

When the user clicks "启动", "停止", or "状态查询" on a node, the system SHALL display a **Drawer** showing execution progress, commands, and results, organized into **Tab categories**.

#### Scenario: Start/Stop shows colored output

- **WHEN** the user clicks "启动" or "停止" on a node
- **THEN** a confirmation dialog SHALL appear first (see node-action-confirm spec)
- **THEN** after confirmation, a **Drawer** SHALL open with "节点 {启动|停止}" as title
- **THEN** the Drawer SHALL display a progress bar and tab-organized content
- **THEN** the "确定" button SHALL be disabled during execution
- **THEN** the Drawer SHALL show the full ansible-playbook command in the "💻 命令" tab
- **THEN** the Drawer SHALL show the return code (rc) in the "📋 关键信息" tab
- **THEN** the Drawer SHALL extract and display key information from stdout in the "📋 关键信息" tab
- **THEN** the Drawer SHALL show the full stdout in the "📄 stdout" tab with ANSI color rendered and stderr in the "❌ stderr" tab
- **THEN** the Drawer SHALL show either "✅ 成功" or "❌ 失败" in the "📋 关键信息" tab
- **THEN** on success or failure, the "确定" button SHALL be enabled
- **AND** the node table SHALL be refreshed after completion

#### Scenario: Status query with colors

- **WHEN** the user clicks "状态查询" on a node
- **THEN** a Drawer SHALL open without confirmation
- **THEN** the Drawer SHALL show "正在执行 edge_statistic..." as log in the "📋 关键信息" tab
- **THEN** the Drawer SHALL display parsed node statistics (CPU usage, memory usage, Edge version) in the "📋 关键信息" tab
- **THEN** the "📄 stdout" tab SHALL render ANSI color codes when present

#### Scenario: Action failure shows error

- **WHEN** the API call fails or returns non-zero rc
- **THEN** the "❌ stderr" tab SHALL be highlighted
- **THEN** the "📋 关键信息" tab SHALL show "❌" and the error message
- **THEN** the "确定" button SHALL be enabled for dismissal
