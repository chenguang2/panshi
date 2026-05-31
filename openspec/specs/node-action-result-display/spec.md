# node-action-result-display Specification

## Purpose
Node action execution results displayed in a Drawer with Tab-based organization for better readability and troubleshooting.

## Requirements

### Requirement: Result display uses Drawer layout
The execution result SHALL be displayed in a `a-drawer` component sliding from the right side, providing full-height and adaptive-width display space.

#### Scenario: Drawer opens on action execution
- **WHEN** user confirms a node start/stop or clicks status query
- **THEN** a Drawer SHALL open with title "节点 {启动|停止|状态查询}"
- **THEN** the Drawer SHALL have a minimum width of 800px
- **THEN** the Drawer SHALL contain a progress bar at the top
- **THEN** the "确定" button SHALL be disabled during execution

### Requirement: Result content organized by tabs
The Drawer content SHALL use `a-tabs` to organize output into four categories.

#### Scenario: Tabs structure
- **WHEN** the Drawer is open with execution results
- **THEN** there SHALL be at least the following tabs:
  - "📋 关键信息" — extracted key info from `extractKeyInfo()`, return code, success/failure status
  - "📄 stdout" — full stdout output in `<pre>` format
  - "❌ stderr" — stderr output (only visible when stderr is non-empty)
  - "💻 命令" — the executed ansible-playbook command

#### Scenario: Key info tab is default
- **WHEN** the Drawer opens
- **THEN** "📋 关键信息" tab SHALL be selected by default
- **THEN** after execution completes, if rc !== 0, "❌ stderr" tab SHALL be highlighted

### Requirement: Copy log button
The Drawer SHALL provide a button to copy all execution logs to clipboard.

#### Scenario: Copy button
- **WHEN** the user clicks "复制日志" button
- **THEN** all log content SHALL be copied to clipboard
- **THEN** a success message SHALL be shown
