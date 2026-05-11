## MODIFIED Requirements

### Requirement: 删除路由同步到 Edge 节点
删除路由时 SHALL 从数据库删除记录，并同步从集群中所有活跃 Edge 节点删除。

#### Scenario: 成功删除路由
- **WHEN** 用户删除一个路由
- **THEN** 系统 SHALL 从数据库删除路由记录
- **AND** SHALL 调用所有活跃 Edge 节点的 DELETE API 删除该路由
- **AND** SHALL 返回每个节点的删除结果
