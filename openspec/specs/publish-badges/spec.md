## Purpose


发布状态徽标：节点操作下拉与上游/路由表格展示发布状态，便于识别未发布配置。
## Requirements
### Requirement: Node operations have more dropdown

The system SHALL provide a dropdown menu ("更多") in the node operations column to display action buttons not selected in the column settings.

#### Scenario: More menu shows unselected actions
- **WHEN** the user clicks "更多 ▼" 
- **THEN** a dropdown SHALL display all node actions not currently shown as buttons
- **THEN** clicking a menu item SHALL trigger the corresponding action

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

### Requirement: 静态资源分发状态徽章

静态资源卡片 SHALL 以专用状态徽章（`StaticResourceStateTag`，视觉对齐 `PublishStatusTag`）展示分发状态五态；判定数据来自列表响应的 `route_exists`/`last_publish_ok`/`last_published_at` 与既有 `current_version`。独立页与集群子页 Tab SHALL 一致接入。

#### Scenario: 配置异常（孤儿资源）
- **WHEN** 资源的关联路由已不存在（`route_exists == false`）
- **THEN** 徽章 SHALL 显示红色「配置异常」，tooltip 提示「关联路由不存在，请删除该资源或重建路由」
- **AND** 该态下发布/上传操作 SHALL 禁用（tooltip 指路），操作收敛为「删除」

#### Scenario: 待上传
- **WHEN** 资源无 `current_version`（未上传 zip）
- **THEN** 徽章 SHALL 显示灰色「待上传」

#### Scenario: 待分发
- **WHEN** 资源有 `current_version` 且 `last_publish_ok == null`（从未发布）
- **THEN** 徽章 SHALL 显示琥珀色「待分发」，tooltip 显示「上传于 {updated_at 格式化}，尚未分发到任何节点」

#### Scenario: 已分发
- **WHEN** `last_publish_ok == true`
- **THEN** 徽章 SHALL 显示绿色「已分发 {success}/{total} 节点」，tooltip 显示「最近分发 {last_published_at 格式化}」

#### Scenario: 分发失败
- **WHEN** `last_publish_ok == false`
- **THEN** 徽章 SHALL 显示红色「{success}/{total} 节点失败」，tooltip 列出失败节点与原因

#### Scenario: 时间语义拆分
- **WHEN** 渲染静态资源卡片时间信息
- **THEN** 版本行时间 SHALL 标注「上传时间」（updated_at），分发时间 SHALL 只出现在徽章 tooltip「最近分发」
- **AND** `PublishStatusTag` 若被静态资源引用，tooltip 时间标签 SHALL 经可选 `timeLabel` 传「最近变更」，SHALL NOT 把 updated_at 标注为「发布时间」；其它资源域默认「发布时间」不变
