# node-action-confirm Specification

## Purpose
Node start/stop operations require explicit user confirmation to prevent accidental production disruptions.

## Requirements

### Requirement: Node start/stop requires confirmation
Before executing start or stop on an edge node, the system SHALL display a confirmation dialog.

#### Scenario: Confirm before start
- **WHEN** the user clicks "启动" on a node
- **THEN** a confirmation dialog SHALL appear with:
  - Title: "确认启动节点"
  - Warning text showing the target node IP
  - "确认启动" button (danger style)
  - "取消" button
- **THEN** the action SHALL only execute after user clicks "确认启动"
- **THEN** if user clicks "取消", no action SHALL be taken

#### Scenario: Confirm before stop
- **WHEN** the user clicks "停止" on a node
- **THEN** a confirmation dialog SHALL appear with:
  - Title: "确认停止节点"
  - Warning text: "停止后该节点上的所有流量将中断"
  - Target node IP displayed prominently
  - "确认停止" button (danger style)
  - "取消" button
- **THEN** the action SHALL only execute after user clicks "确认停止"

#### Scenario: Status query does not require confirmation
- **WHEN** the user clicks "状态查询" on a node
- **THEN** no confirmation dialog SHALL be shown
- **THEN** the status query SHALL execute immediately
