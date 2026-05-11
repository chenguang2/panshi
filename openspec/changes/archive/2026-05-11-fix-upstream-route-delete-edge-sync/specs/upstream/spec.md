## MODIFIED Requirements

### Requirement: 删除上游同步到 Edge 节点
删除上游时 SHALL 从数据库删除记录，并同步从集群中所有活跃 Edge 节点删除。

#### Scenario: 成功删除上游
- **WHEN** 用户删除一个上游
- **THEN** 系统 SHALL 从数据库删除上游记录
- **AND** SHALL 调用所有活跃 Edge 节点的 DELETE API 删除该上游
- **AND** SHALL 返回每个节点的删除结果

#### Scenario: 部分节点不可达
- **WHEN** 删除上游时部分 Edge 节点不可达
- **THEN** 系统 SHALL 仍从数据库删除记录
- **AND** SHALL 返回包含成功和失败节点的结果列表
