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

### Requirement: Group filter is server-side via API parameter
The system SHALL implement group filtering by passing the selected `group_name` as a backend API query parameter. The frontend SHALL include `group_name` in API requests when a specific group is selected. The backend SHALL perform server-side filtering via Cluster JOIN.

#### Scenario: Group filter triggers API request with group_name
- **WHEN** user selects a specific group from the group filter
- **THEN** the list page SHALL send an API request with `group_name=<selected_group>` parameter
- **AND** the response SHALL return only resources belonging to that group
- **AND** pagination SHALL behave normally (server-side, not client-side)

#### Scenario: Selecting "__all__" sends explicit all-groups value
- **WHEN** user selects "全部分组"
- **THEN** the API request SHALL include `group_name=__all__`
- **AND** the backend SHALL return resources from all clusters (no group filtering)

#### Scenario: Selecting "__ung__" sends special value
- **WHEN** user selects "未分组"
- **THEN** the API request SHALL include `group_name=__ung__`
- **AND** the backend SHALL interpret this as filtering for clusters with `group_name IS NULL OR group_name = ""`

#### Scenario: No groups exist
- **WHEN** no clusters have a `group_name` set
- **THEN** the group filter dropdown SHALL show only "全部分组" and "未分组"
- **AND** selecting "全部分组" SHALL omit `group_name` from the API call

### Requirement: Card grid pages display group affiliation on each card

卡片网格布局的页面（插件组、全局规则、插件元数据、静态资源、四层代理）SHALL 在每张卡片的顶栏同时显示集群名称和分组名称，以帮助用户快速识别资源所属的组。

#### Scenario: Card topbar shows cluster name with group badge
- **WHEN** 卡片网格页面渲染卡片
- **THEN** 顶栏左侧 SHALL 显示集群名
- **AND** 右侧 SHALL 显示分组名作为小圆角标签（pill badge）
- **AND** 顶栏背景色 SHALL 根据分组名分配确定性颜色（8色调色板，通过字符串哈希映射）
- **AND** 无分组时 SHALL 不显示 badge，顶栏保持默认样式

#### Scenario: 分组颜色一致性
- **WHEN** 同一分组出现在不同卡片上
- **THEN** 它们的顶栏颜色 SHALL 相同（基于分组名字符串的确定性哈希映射）

#### Scenario: API 响应包含 cluster_group_name
- **WHEN** 前端请求任意全局列表 API
- **THEN** 响应中的每个 item SHALL 包含 `cluster_group_name` 字段（字符串，无分组时为 `""`），供前端顶栏渲染使用

### Requirement: 卡片网格全量加载

卡片网格布局的页面（插件组、全局规则、插件元数据、静态资源、四层代理）SHALL 不进行服务端分页，改为一次加载全部匹配数据。

#### Scenario: 全量加载
- **WHEN** 用户进入卡片网格页面或切换筛选条件
- **THEN** API 请求 SHALL 使用 `page_size: 500`（`PAGE_SIZE_CARD_GRID` 常量）以加载所有匹配项
- **AND** 页面 SHALL 展示全部返回的卡片（不限制每页数量）
- **AND** 顶部计数 SHALL 显示实际返回总数

### Requirement: 分页大小使用全局常量

项目 SHALL 使用统一的全局常量定义分页大小，集中在 `frontend/src/constants.ts`。

#### Scenario: 三个分页常量
- **WHEN** 代码中涉及分页大小
- **THEN** 表格页面默认值 SHALL 使用 `PAGE_SIZE_TABLE = 20`
- **AND** 卡片网格加载 SHALL 使用 `PAGE_SIZE_CARD_GRID = 500`
- **AND** 下拉选择框 SHALL 使用 `PAGE_SIZE_DROPDOWN = 500`
