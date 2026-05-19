## ADDED Requirements

### Requirement: 上游 PATCH 端点

后端 SHALL 提供上游资源的 PATCH 更新端点，支持部分字段更新。

#### Scenario: PATCH 更新上游
- **WHEN** 调用 `PATCH /edge-client/nodes/{ip}/{port}/upstreams/{id}`
- **THEN** 后端调用 EdgeClient.patch_upstream() 向 Edge 节点发送部分更新请求

### Requirement: 路由 PATCH 端点

后端 SHALL 提供路由资源的 PATCH 更新端点，支持部分字段更新。服务层 SHALL 新增 `patch_route` 方法。

#### Scenario: PATCH 更新路由
- **WHEN** 调用 `PATCH /edge-client/nodes/{ip}/{port}/routes/{id}`
- **THEN** 后端调用 EdgeClient.patch_route() 向 Edge 节点发送部分更新请求

### Requirement: 插件元数据 PATCH 端点

后端 SHALL 提供插件元数据的 PATCH 更新端点，支持部分字段更新。服务层 SHALL 新增 `update_plugin_metadata` 方法。

#### Scenario: PATCH 更新插件元数据
- **WHEN** 调用 `PATCH /edge-client/nodes/{ip}/{port}/plugin_metadata/{name}`
- **THEN** 后端调用 EdgeClient.update_plugin_metadata() 向 Edge 节点发送部分更新请求
