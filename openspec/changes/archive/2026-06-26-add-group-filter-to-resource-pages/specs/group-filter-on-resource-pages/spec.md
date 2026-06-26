## ADDED Requirements

### Requirement: Resource list pages support group pre-filtering
The system SHALL provide a group filter dropdown on all resource list pages (nodes, upstreams, routes, plugin configs, stream proxies, global rules, static resources, edge.env), positioned between the search input and the cluster filter dropdown.

#### Scenario: Group filter appears on each page
- **WHEN** user navigates to any resource management page (节点管理, 上游管理, 路由管理, 插件组, 四层代理, 全局规则, 静态资源, edge.env 配置)
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

#### Scenario: Selecting "全部分组" shows all clusters
- **WHEN** user selects "全部分组"
- **THEN** the cluster filter dropdown SHALL show all clusters (original behavior)

#### Scenario: Selecting "未分组" shows ungrouped clusters
- **WHEN** user selects "未分组"
- **THEN** the cluster filter dropdown SHALL only show clusters with empty `group_name`

#### Scenario: EdgeEnv filter bar is restructured
- **WHEN** user navigates to the edge.env configuration page
- **THEN** the filter bar SHALL use a flat layout with: search input, group filter dropdown, cluster dropdown, and node dropdown
- **AND** the previous label-based layout (`集群: [select] 参考节点: [select]`) SHALL be replaced

#### Scenario: RouteList group change triggers upstream reload
- **WHEN** user changes the group filter on the route list page
- **THEN** the upstream filter SHALL reset to "全部上游"
- **AND** upstream list SHALL reload via `loadUpstreams(undefined)`
- **AND** routes SHALL reload via `loadRoutes()`

#### Scenario: No groups exist
- **WHEN** no clusters have a `group_name` set
- **THEN** the group filter dropdown SHALL show only "全部分组" and "未分组"
- **AND** selecting "全部分组" behaves identically to having no group filter

### Requirement: Group filter is client-side only
The system SHALL implement group filtering entirely on the frontend, without backend API changes.

#### Scenario: No additional API calls
- **WHEN** user selects a group filter value
- **THEN** no new API requests SHALL be made
- **AND** filtering SHALL use the already-loaded clusters list

#### Scenario: Group filter does not affect data loading
- **WHEN** the page loads its resource list
- **THEN** the API request SHALL NOT include any group-related parameters
- **AND** the group filter acts only on the client-side cluster filter options
