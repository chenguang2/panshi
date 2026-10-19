# publish-badges Delta

## MODIFIED Requirements

### Requirement: Upstream and route tables show publish status

The upstream and route tables SHALL display a "发布状态" column rendered by `PublishStatusTag`，覆盖四态：未发布 / 待发布（已发布但平台侧存在未下发修改，依据 `pending_publish`）/ 已发布（版本 + 发布时间）/ 发布未完全生效（partial）。路由域 SHALL 完成接线：后端路由列表响应 SHALL 返回 `pending_publish`，路由独立页与 Tab 的发布状态列 SHALL 消费该字段。

#### Scenario: Published item shows version and time
- **WHEN** an upstream or route has a `current_version` and `published_at` and `pending_publish` is false
- **THEN** the status column SHALL display a green badge with version and publish time

#### Scenario: Unpublished item shows pending status
- **WHEN** an upstream or route has no `current_version`
- **THEN** the status column SHALL display an orange "未发布" badge

#### Scenario: Route backend returns pending_publish
- **WHEN** the route list/detail API serializes a route (`route_to_response`)
- **THEN** the response SHALL include `pending_publish` derived via `edge_sync.derive_pending_publish`（与 cluster_upstreams.py 同款三参推导：updated_at 与 ConfigVersion published_at 比较）

#### Scenario: Route modified after publish shows 待发布
- **WHEN** a route has a `current_version` but `pending_publish` is true
- **THEN** the status column SHALL display the "待发布" badge instead of the plain version badge

#### Scenario: Route standalone page uses the status tag
- **WHEN** the route standalone page (`/routes`) renders the list
- **THEN** the bare version column (`v{current_version}`/`-`) SHALL be replaced by the `PublishStatusTag` column
- **THEN** the publish status filter SHALL offer a "待发布" option（`publish_status=pending`，基于 pending_publish 过滤）
- **THEN** 独立页发布状态筛选 SHALL 为互斥三分区（published=有版本且非 pending / pending / unpublished，SHALL NOT 重叠命中，语义见 route-management）
