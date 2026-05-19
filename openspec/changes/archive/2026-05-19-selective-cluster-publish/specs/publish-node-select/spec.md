## ADDED Requirements

### Requirement: Publish confirm dialog SHALL display node selection list

The publish confirm dialog SHALL display all nodes in the cluster with their IP, management port, service port, and online/offline status. Each node SHALL have a checkbox. All checkboxes SHALL be unchecked by default.

#### Scenario: Dialog shows all cluster nodes
- **WHEN** the user clicks any "发布" button (upstream/route/plugin_config/global_rule/static_resource/plugin_metadata)
- **THEN** a confirmation dialog SHALL appear showing all nodes belonging to that cluster
- **THEN** each node row SHALL display `ip:management_port`, `service_port`, and `status`
- **THEN** all node checkboxes SHALL be unchecked

#### Scenario: Offline nodes are disabled
- **WHEN** a node has `status != 1` (offline)
- **THEN** its checkbox SHALL be disabled and the row SHALL be grayed out
- **THEN** the row SHALL display "离线" indicator

### Requirement: Publish confirm dialog SHALL support select all / deselect all

The dialog SHALL provide "全选" and "取消全选" links. "全选" SHALL only select online nodes. "取消全选" SHALL clear all selections. A live counter SHALL show "已选择 X / N 个节点".

#### Scenario: Select all online nodes
- **WHEN** the user clicks "全选"
- **THEN** all online nodes SHALL be checked
- **THEN** offline nodes SHALL remain unchecked and disabled
- **THEN** the counter SHALL update to "已选择 {online_count} / {total_count} 个节点"

#### Scenario: Deselect all
- **WHEN** the user clicks "取消全选"
- **THEN** all checkboxes SHALL be cleared
- **THEN** the counter SHALL show "已选择 0 / {total_count} 个节点"

### Requirement: Publish confirm dialog SHALL validate at least one node selected

The confirm button SHALL be disabled when no node is selected. A hint message "请至少选择 1 个节点" SHALL be displayed.

#### Scenario: Confirm with no selection
- **WHEN** no node is checked and the user clicks "确认发布"
- **THEN** the button SHALL be disabled and nothing SHALL happen
- **THEN** the hint "请至少选择 1 个节点" SHALL be visible

#### Scenario: Confirm with selection
- **WHEN** at least one node is checked and the user clicks "确认发布"
- **THEN** the dialog SHALL close
- **THEN** a progress modal SHALL open showing per-node publish results

### Requirement: Backend publish endpoint SHALL accept optional node_ids

Each of the 6 publish endpoints SHALL accept an optional `PublishRequest` body with a `node_ids` field. When `node_ids` is provided, the endpoint SHALL only publish to the specified nodes. When `node_ids` is null/empty, the endpoint SHALL publish to all online nodes (backward compatible).

#### Scenario: Publish to specific nodes
- **WHEN** the client sends `POST /clusters/{id}/upstreams/{upstream_id}/publish` with `{"node_ids": [1, 3, 5]}`
- **THEN** the server SHALL only publish to nodes with `id` 1, 3, 5
- **THEN** the response SHALL include `results` only for those 3 nodes

#### Scenario: Backward compatible (no node_ids)
- **WHEN** the client sends `POST /clusters/{id}/upstreams/{upstream_id}/publish` without a body
- **THEN** the server SHALL publish to all online nodes in the cluster
- **THEN** the behavior SHALL be identical to the current implementation

#### Scenario: Invalid node_ids rejected
- **WHEN** the client sends `node_ids` containing IDs that do not belong to the cluster
- **THEN** the server SHALL ignore those IDs and only publish to matching nodes
