# publish-node-select Delta

## MODIFIED Requirements

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
