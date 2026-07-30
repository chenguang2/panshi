## ADDED Requirements

### Requirement: 静态资源发布记录 Edge 操作日志

发布静态资源时，对每个活跃 Edge 节点的 API 调用 SHALL 记录到 `logs/edge/static_resource.log` 文件中。

#### Scenario: 静态资源全部节点成功
- **WHEN** 发布静态资源且所有节点同步成功
- **THEN** 每条成功记录包含：时间戳、集群信息、静态资源名称、请求方法/PATH、响应状态码、Status: SUCCESS

#### Scenario: 静态资源部分节点失败
- **WHEN** 发布静态资源且部分节点同步失败
- **THEN** 成功节点记录 Status: SUCCESS，失败节点记录 Status: FAILED 并包含错误信息
