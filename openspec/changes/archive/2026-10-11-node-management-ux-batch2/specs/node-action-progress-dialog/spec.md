# node-action-progress-dialog Delta

## MODIFIED Requirements

### Requirement: Node action executes with progress dialog

When the user clicks "启动", "停止", or "状态查询" on a node, the system SHALL display a **Drawer** showing execution progress, commands, and results, organized into **Tab categories**.

#### Scenario: Start/Stop shows confirmation first
- **WHEN** the user clicks "启动" or "停止" on a node
- **THEN** a confirmation dialog SHALL appear first (see node-action-confirm spec)
- **THEN** after confirmation, a **Drawer** SHALL open with "节点 {启动|停止}" as title
- **THEN** while executing, the Drawer SHALL display an **indeterminate progress indicator** (animated bar + elapsed time) as the initial form — the indicator SHALL NOT render a time-extrapolated fake percentage
- **THEN** upon receiving the first server-side `percent` event (e.g. cancel-install streams), the indicator SHALL automatically switch to rendering the real percent
- **THEN** the "确定" button SHALL be disabled during execution
- **THEN** the Drawer SHALL show the full ansible-playbook command in the "💻 命令" tab
- **THEN** the Drawer SHALL show the return code (rc) in the "📋 关键信息" tab
- **THEN** the Drawer SHALL extract and display key information from stdout in the "📋 关键信息" tab
- **THEN** the Drawer SHALL show the full stdout in the "📄 stdout" tab with ANSI color rendered and stderr in the "❌ stderr" tab
- **THEN** the Drawer SHALL show either "✅ 成功" or "❌ 失败" in the "📋 关键信息" tab
- **THEN** on success or failure, the progress indicator SHALL resolve to its terminal state (success/exception) and the "确定" button SHALL be enabled
- **AND** the node table SHALL be refreshed after completion

#### Scenario: Status query opens Drawer directly
- **WHEN** the user clicks "状态查询" on a node
- **THEN** a Drawer SHALL open without confirmation
- **THEN** the Drawer SHALL show "正在执行 edge_statistic..." as log in the "📋 关键信息" tab
- **THEN** the Drawer SHALL display parsed node statistics (CPU usage, memory usage, Edge version) in the "📋 关键信息" tab

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

#### Scenario: Install flows keep real percent
- **WHEN** the Drawer is driven by an install-type stream that emits server-side percent events
- **THEN** the Drawer SHALL keep rendering the real percent (the indeterminate mode SHALL NOT apply)

#### Scenario: Single progress model across entrances
- **WHEN** a node action is executed from the standalone page (NodeList) or the cluster Tab (ClusterNodes)
- **THEN** both entrances SHALL share the same Drawer progress model (indeterminate for actions, real percent for installs) — no per-entrance fake progress
