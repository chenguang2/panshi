## Purpose

Node selection dialog for selective cluster publish operations.

## Requirements

### Requirement: Publish confirm dialog SHALL display node selection list

The publish confirm dialog SHALL display all nodes in the cluster with their IP, management port, service port, and online/offline status. Each node SHALL have a checkbox. 打开弹窗时 SHALL 默认选中全部在线节点（离线节点默认不选且禁用），保留「全选/取消全选」操作。

#### Scenario: Dialog shows all cluster nodes
- **WHEN** the user clicks any "发布" button (upstream/route/plugin_config/global_rule/static_resource/plugin_metadata)
- **THEN** a confirmation dialog SHALL appear showing all nodes belonging to that cluster
- **THEN** each node row SHALL display `ip:management_port`, `service_port`, and `status`

#### Scenario: Online nodes selected by default
- **WHEN** the dialog opens
- **THEN** 所有在线节点（`status == 1`）的 checkbox SHALL 默认勾选
- **THEN** 用户可「取消全选」后自行勾选；离线节点 SHALL NOT 被默认勾选

#### Scenario: Offline nodes are disabled
- **WHEN** a node has `status != 1` (offline)
- **THEN** its checkbox SHALL be disabled and the row SHALL be grayed out
- **THEN** the row SHALL display "离线" indicator

#### Scenario: 全离线集群默认空选
- **WHEN** 集群全部节点离线且弹窗打开
- **THEN** 默认选中集 SHALL 为空，确认键 SHALL 保持禁用（复用既有「请至少选择 1 个节点」守卫）

### Requirement: Publish confirm dialog SHALL support select all / deselect all

The dialog SHALL provide "全选" and "取消全选" links. "全选" SHALL only select online nodes. "取消全选" SHALL clear all selections. A live counter SHALL show「已选择 {N} 个在线节点」，集群存在离线节点时附「（{M} 个离线不可选）」。

#### Scenario: Select all online nodes
- **WHEN** the user clicks "全选"
- **THEN** all online nodes SHALL be checked
- **THEN** offline nodes SHALL remain unchecked and disabled
- **THEN** the counter SHALL update to「已选择 {online_count} 个在线节点」；存在离线节点时 SHALL 显示「（{offline_count} 个离线不可选）」

#### Scenario: Deselect all
- **WHEN** the user clicks "取消全选"
- **THEN** all checkboxes SHALL be cleared
- **THEN** the counter SHALL show「已选择 0 个在线节点」（存在离线节点时附离线数说明）

#### Scenario: 分母不再计入离线节点
- **WHEN** 集群含离线节点且弹窗打开
- **THEN** 计数 SHALL NOT 以含离线的总节点数作分母（SHALL NOT 显示「X / 含离线总数」形态）
- **AND** 该计数形态为共享弹窗单点实现，全部资源域一致生效
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

### Requirement: Publish confirm dialog SHALL support resource context summary

The publish confirm dialog SHALL accept an optional resource summary line and an optional overwrite warning. 未传参的资源域 SHALL NOT 渲染这两个区域（向后兼容）。

#### Scenario: 静态资源发布显示摘要与覆盖预警
- **WHEN** 静态资源任一入口打开发布确认弹窗
- **THEN** 弹窗顶部 SHALL 显示资源摘要「将把「{name}」v{N}（{size}，{url_path}）分发到所选节点」
- **AND** 确认按钮上方 SHALL 显示 danger 覆盖预警「发布将覆盖所选节点上的现有静态资源文件」
- **AND** SHALL NOT 复用「本次发布将创建新版本 vN+1」版本提示行（静态资源发布不产生新版本，版本在上传时递增）

#### Scenario: 其它资源域不受影响
- **WHEN** 未传 `resourceSummary`/`overwriteWarning` 的资源域打开发布确认弹窗
- **THEN** 摘要与预警区域 SHALL NOT 渲染，既有布局与文案 SHALL 不变
