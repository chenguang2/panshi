# group-name-api-filter — Delta

## ADDED Requirements

### Requirement: Node task list endpoint supports group_name
`GET /node-tasks`（全局任务列表端点）SHALL 支持 `group_name` 查询参数，语义与既有 8 个全局列表端点完全一致：具名分组精确匹配、`__ung__` 匹配无分组集群、`__all__`（及缺省）不做分组过滤。

#### Scenario: Node task list filters by group_name
- **WHEN** client sends `group_name=<具名分组>` to `GET /node-tasks`
- **THEN** the response SHALL return only tasks whose cluster belongs to that group
- **AND** `total` SHALL reflect the filtered count and pagination SHALL behave normally

#### Scenario: Node task list ungrouped filter
- **WHEN** client sends `group_name=__ung__` to `GET /node-tasks`
- **THEN** the response SHALL return only tasks whose cluster has empty `group_name`（`IS NULL` 或空串）

#### Scenario: Node task list default returns all groups
- **WHEN** client omits `group_name` or sends `group_name=__all__`
- **THEN** the response SHALL NOT apply any group filtering

#### Scenario: Cluster-scoped task endpoint is unchanged
- **WHEN** client calls `GET /clusters/{cluster_id}/node-tasks`
- **THEN** the endpoint SHALL NOT accept a `group_name` parameter（集群已唯一确定分组，参数冗余）
