## MODIFIED Requirements

### Requirement: 删除弹窗中 Edge 节点可单独选择

用户 SHALL 能够在删除弹窗中勾选"Edge 节点"后，看到所有活跃 Edge 节点列表，并可单独勾选某些节点。

#### Scenario: 勾选 Edge 节点后显示节点列表
- **WHEN** 用户在删除弹窗中勾选"Edge 节点"
- **THEN** 下方展开显示所有活跃 Edge 节点列表（IP:port）
- **AND** 每个节点前有一个 checkbox，**默认全部不选**

#### Scenario: 勾选部分节点
- **WHEN** 用户勾选某个或多个节点的 checkbox
- **THEN** 该节点会收到删除请求
- **AND** 其他未勾选的节点不受影响

#### Scenario: 所有节点不选
- **WHEN** 用户未勾选任何节点且勾选了"Edge 节点"
- **THEN** 不向任何 Edge 节点发送删除请求

#### Scenario: 仅删除数据库不操作 Edge 节点
- **WHEN** 用户仅勾选"数据库"未勾选"Edge 节点"
- **THEN** 节点列表不显示
- **AND** 只删除数据库记录，不调用任何节点接口

#### Scenario: 日志根据选项条件显示
- **WHEN** 用户仅删除 Edge 节点未删除数据库
- **THEN** 日志中不显示"数据库已删除"相关文案
