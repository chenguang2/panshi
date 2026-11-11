# Spec Delta

## MODIFIED Requirements

### Requirement: Resource list pages support group pre-filtering
The system SHALL provide a group filter dropdown on all resource list pages (nodes, upstreams, routes, plugin configs, plugin metadata, stream proxies, DNS UDP proxies, DNS queries, global rules, static resources, server certificates, CA certificates), positioned before the cluster filter dropdown. The cluster filter SHALL be the shared cluster select control (searchable, grouped presentation, explicit 「全部集群」 option) defined by the `cluster-select-component` capability.

#### Scenario: Group filter appears on each page
<!-- 裁决来源：cluster-select-unification 2026-11-11。页面清单修正为现行 12 个资源页；edge.env 配置页移出本能力（其集群选择器为分组 optGroup + 搜索的必选模式、无组筛选下拉，归属 edge-env-remote-editing 规格）。 -->
- **WHEN** user navigates to any resource management page (节点管理, 上游管理, 路由管理, 插件配置, 插件元数据, 四层代理, DNS 代理, DNS 查询, 全局规则, 静态资源, 服务器证书, CA 根证书)
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
<!-- 裁决来源：cluster-select-unification 2026-11-11，按现行实现与 edge-env-remote-editing 主规格修正。EdgeEnv 无组筛选下拉：集群选择器为必选模式（分组 optGroup + 搜索、无「全部集群」项），本能力不再约束其内部形态。 -->
- **WHEN** user navigates to the edge.env configuration page
- **THEN** the page SHALL present: search-free filter row with the shared cluster selector (mandatory mode) and the node dropdown
- **AND** no group filter dropdown SHALL appear on this page
- **AND** the cluster selector's grouping, search, and URL deep-link behavior SHALL follow the `edge-env-remote-editing` capability

#### Scenario: RouteList group change triggers upstream reload
- **WHEN** user changes the group filter on the route list page
- **THEN** the upstream filter SHALL reset to "全部上游"
- **AND** upstream list SHALL reload via `loadUpstreams(undefined)`
- **AND** routes SHALL reload via `loadRoutes()`

#### Scenario: No groups exist
- **WHEN** no clusters have a `group_name` set
- **THEN** the group filter dropdown SHALL show only "全部分组" and "未分组"
- **AND** selecting "全部分组" behaves identically to having no group filter

## ADDED Requirements

### Requirement: Resource page cluster filter is the shared cluster select control
The cluster filter on resource list pages SHALL be rendered by the shared cluster select control per the `cluster-select-component` capability: keyword search over the current scope, grouped option presentation with 「未分组」 at the end, and an explicit 「全部集群」 first option. The group filter dropdown, its option values (`__all__` / group name / `__ung__`), and the cascade behavior SHALL remain unchanged.

#### Scenario: Cluster filter supports keyword search
- **WHEN** user types a keyword into the cluster filter on any resource list page
- **THEN** options SHALL narrow to clusters whose display name or name contains the keyword (case-insensitive) within the current group-filtered scope
- **AND** a keyword matching no cluster SHALL show an empty result state

#### Scenario: Cluster filter presents grouped options
- **WHEN** the cluster filter dropdown opens with 「全部分组」 selected
- **THEN** clusters SHALL be presented under 分组 opt-group headers sorted by name
- **AND** ungrouped clusters SHALL appear under a 「未分组」 header at the end

#### Scenario: Cluster filter offers 全部集群
- **WHEN** the cluster filter dropdown opens
- **THEN** the first option SHALL be 「全部集群」 representing "no specific cluster selected"
- **AND** selecting it SHALL keep the current group filter in effect and show resources across all clusters in scope
