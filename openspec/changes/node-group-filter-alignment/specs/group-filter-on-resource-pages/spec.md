# group-filter-on-resource-pages — Delta

## MODIFIED Requirements

### Requirement: Resource list pages support group pre-filtering
The system SHALL provide a group filter dropdown on all resource list pages (nodes, upstreams, routes, plugin configs, stream proxies, global rules, static resources, edge.env, 自启动管理, 节点任务中心), positioned between the search input and the cluster filter dropdown.

#### Scenario: Group filter appears on each page
- **WHEN** user navigates to any resource management page (节点管理, 上游管理, 路由管理, 插件组, 四层代理, 全局规则, 静态资源, edge.env 配置, 自启动管理, 节点任务中心)
- **THEN** a group filter dropdown SHALL appear before the cluster filter, with default option "全部分组"

#### Scenario: Group filter options are derived from clusters
- **WHEN** the page loads the cluster list
- **THEN** the group filter dropdown SHALL populate with unique `group_name` values from all clusters
- **AND** a "未分组" option SHALL exist for clusters with empty `group_name`

#### Scenario: Selecting a group filters the cluster dropdown
- **WHEN** user selects a specific group from the group filter
- **THEN** the cluster filter dropdown SHALL only show clusters belonging to that group
- **AND** the cluster filter SHALL reset to "全部集群" when group selection changes
- **AND** on RouteList, the upstream filter SHALL also reset and upstreams SHALL reload

#### Scenario: Selecting a group filters the node list on 自启动管理
- **WHEN** user selects a specific group from the group filter on the 自启动管理 page
- **THEN** the node list SHALL reload filtered server-side by `group_name` (only nodes of clusters in that group)
- **AND** selecting "全部分组" or "未分组" SHALL reload with the corresponding `group_name` value (`__all__` / `__ung__`)
- **AND** the cluster filter SHALL reset to "全部集群" when group selection changes

#### Scenario: Selecting a group filters the task list on 节点任务中心
- **WHEN** user selects a specific group from the group filter on the 节点任务中心 page
- **THEN** the task list SHALL reload filtered server-side by `group_name` (only tasks of clusters in that group)
- **AND** the group SHALL participate in the「有生效筛选」空态判定
- **AND** the group selection SHALL be preserved across detail-page round-trips via the URL query (same mechanism as the cluster deep-link)

#### Scenario: Selecting "全部分组" shows all clusters
- **WHEN** user selects "全部分组"
- **THEN** the cluster filter dropdown SHALL show all clusters (original behavior)

#### Scenario: Selecting "未分组" shows ungrouped clusters
- **WHEN** user selects "未分组"
- **THEN** the cluster filter dropdown SHALL only show clusters with empty `group_name`

#### Scenario: No groups exist
- **WHEN** no clusters have a `group_name` set
- **THEN** the group filter dropdown SHALL show only "全部分组" and "未分组"
- **AND** selecting "全部分组" behaves identically to having no group filter

#### Scenario: EdgeEnv filter bar is restructured
- **WHEN** user navigates to the edge.env configuration page
- **THEN** the filter bar SHALL use a flat layout with: search input, group filter dropdown, cluster dropdown, and node dropdown
- **AND** the previous label-based layout (`集群: [select] 参考节点: [select]`) SHALL be replaced

#### Scenario: RouteList group change triggers upstream reload
- **WHEN** user changes the group filter on the route list page
- **THEN** the upstream filter SHALL reset to "全部上游"
- **AND** upstream list SHALL reload via `loadUpstreams(undefined)`
