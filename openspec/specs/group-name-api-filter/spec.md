## Purpose

全局列表 API 的 group_name 过滤与 cluster_group_name 响应字段（8 个端点）。

## Requirements
### Requirement: Global list APIs support group_name query filter
All global resource list API endpoints SHALL accept an optional `group_name` query parameter to filter resources by cluster group. When provided, the backend SHALL join the resource's cluster and filter by `Cluster.group_name`.

#### Scenario: group_name filters by exact match
- **WHEN** client calls `GET /routes?group_name=production`
- **THEN** the response SHALL only include routes whose cluster has `group_name = "production"`

#### Scenario: group_name=__ung__ filters ungrouped clusters
- **WHEN** client calls `GET /upstreams?group_name=__ung__`
- **THEN** the response SHALL only include upstreams whose cluster has `group_name IS NULL OR group_name = ""`

#### Scenario: group_name defaults to __all__
- **WHEN** client calls `GET /routes` without `group_name`
- **THEN** the backend SHALL treat it as `group_name=__all__`
- **AND** the response SHALL include routes from all clusters (original behavior unchanged)

#### Scenario: group_name works with other filters
- **WHEN** client calls `GET /routes?group_name=staging&search=api`
- **THEN** the response SHALL filter by both `group_name` and `search` simultaneously

#### Scenario: group_name works with pagination
- **WHEN** client calls `GET /routes?group_name=production&page=2&page_size=20`
- **THEN** the response SHALL return page 2 of production-group routes with correct total count

### Requirement: All 8 global list endpoints support group_name
The following endpoints SHALL all support the `group_name` query parameter with identical semantics:

- `GET /routes`
- `GET /upstreams`
- `GET /nodes`
- `GET /plugin_configs`
- `GET /global_rules`
- `GET /plugin_metadata`
- `GET /static_resources`
- `GET /stream-proxies`

#### Scenario: Each endpoint supports group_name
- **WHEN** client sends `group_name=production` to any of the 8 endpoints
- **THEN** the response SHALL be correctly filtered to resources in production-group clusters

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

### Requirement: Response includes cluster_group_name

所有全局列表 API 的响应 item SHALL 包含 `cluster_group_name` 字段，供前端展示资源所属分组。

#### Scenario: cluster_group_name 在响应中
- **WHEN** 客户端调用任意全局列表 API
- **THEN** 每个 item SHALL 包含 `cluster_group_name` 字段
- **AND** 值为对应集群的 `group_name`（无分组时为 `""`）
- **AND** 现有 `cluster_name` 字段不变
