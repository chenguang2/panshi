## ADDED Requirements

### Requirement: Upstream references precheck endpoint

系统 SHALL 提供只读端点，供前端在批量删除**之前**查询被路由引用的上游，使「跳过提示」与后端删除拦截语义一致。

#### Scenario: 查询指定上游的引用清单
- **WHEN** 请求 `GET /api/v1/clusters/{cluster_id}/upstreams/references?ids=1,2,3`
- **THEN** 系统 SHALL 仅返回**存在引用**的上游，形如 `{ items: [{ upstream_id, upstream_name, routes: [{ route_id, route_name }] }] }`
- **AND** 判定条件 SHALL 与批量删除拦截一致（`Route.upstream_id in ids`）

#### Scenario: 不属于该集群的 id 被忽略
- **WHEN** `ids` 中含其他集群的上游 id 或不存在的 id
- **THEN** 系统 SHALL 返回 200 且该 id SHALL NOT 出现在 `items` 中
- **AND** SHALL NOT 暴露其他集群的信息

#### Scenario: 参数校验
- **WHEN** `ids` 缺失
- **THEN** 系统 SHALL 返回 422
- **WHEN** `ids` 为空串、含非整数或去重后超过 500 个
- **THEN** 系统 SHALL 返回 400

#### Scenario: 端点需要认证
- **WHEN** 未携带有效令牌请求该端点
- **THEN** 系统 SHALL 返回 401

#### Scenario: 前端据此跳过被引用上游
- **WHEN** 用户批量删除上游，其中部分被路由引用
- **THEN** 前端 SHALL 在打开确认框前调用该端点，把被引用项从待删列表剔除
- **AND** 确认框 SHALL 明示「已跳过 N 条被路由引用的上游」
- **WHEN** 全部选中项都被引用
- **THEN** 前端 SHALL 只提示且 SHALL NOT 打开确认框、SHALL NOT 发送删除请求
