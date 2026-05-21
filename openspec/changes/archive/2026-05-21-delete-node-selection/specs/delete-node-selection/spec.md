## ADDED Requirements

### Requirement: 删除弹窗中 Edge 节点可单独选择

用户 SHALL 能够在删除弹窗中勾选"Edge 节点"后，看到所有活跃 Edge 节点列表，并可单独取消勾选某些节点。

#### Scenario: 勾选 Edge 节点后显示节点列表
- **WHEN** 用户在删除弹窗中勾选"Edge 节点"
- **THEN** 下方展开显示所有活跃 Edge 节点列表（IP:port）
- **AND** 每个节点前有一个 checkbox，默认全部选中

#### Scenario: 取消勾选部分节点
- **WHEN** 用户取消勾选某个或多个节点的 checkbox
- **THEN** 该节点不会收到删除请求
- **AND** 其他勾选的节点正常删除

#### Scenario: 所有节点取消勾选
- **WHEN** 用户将所有节点 checkbox 取消
- **THEN** 不向任何 Edge 节点发送删除请求
