# cluster-card-grid Delta

## MODIFIED Requirements

### Requirement: Cluster card shows key metrics

Each cluster card SHALL display essential information at a glance.

#### Scenario: Card displays cluster name and status
- **WHEN** a cluster card is rendered
- **THEN** it SHALL display the cluster display name, internal name hint, and an enable status badge (已启用/已禁用)
- **AND** meta 区 SHALL 含集群发布状态微标（未发布/配置 vN，语义见 `cluster-list-page` 能力）

#### Scenario: Card displays all resource counts as clickable links
- **WHEN** a cluster card is rendered
- **THEN** it SHALL display seven statistics: node count (healthy/total), upstream count, route count, plugin config count, global rule count, plugin metadata count, and static resource count
- **AND** each statistic SHALL be a clickable link to the corresponding resource management page
- **AND** the node count SHALL display as "healthy/total" format

#### Scenario: Card shows action buttons
- **WHEN** a cluster card is rendered
- **THEN** it SHALL display "详情 / 连接测试 / 编辑 / 删除" actions（两页统一顺序与样式，删除危险色置最右）

### Requirement: Cluster search and filter

The cluster list page SHALL provide search and filtering capabilities.

#### Scenario: Search by cluster name
- **WHEN** the user types in the search input
- **THEN** the card grid SHALL filter to show only clusters whose name or display name matches the query

#### Scenario: Filter by status
- **WHEN** the user clicks a status filter option (已启用/已禁用)
- **THEN** the card grid SHALL filter by the cluster enable flag（`cluster.status`），MUST NOT 以「健康/离线」命名该筛选（节点健康不是集群启用态）

#### Scenario: Combined search and filter
- **WHEN** the user types a search query AND selects a status filter
- **THEN** both filters SHALL be applied simultaneously

## RENAMED Requirements

- FROM: `### Requirement: 分组字段必填，默认未分类`
- TO: `### Requirement: 分组字段必填，默认未分组`

## MODIFIED Requirements

### Requirement: 分组字段必填，默认未分组

集群编辑表单的"分组"字段 SHALL 始终有值，不可为空。

#### Scenario: 新建集群默认未分组
- **WHEN** 用户打开添加集群弹窗
- **THEN** 分组下拉默认显示「未分组」
- **AND** `group_name` 值为空字符串

#### Scenario: 编辑集群显示当前分组
- **WHEN** 用户打开编辑集群弹窗
- **THEN** 分组下拉显示该集群当前分组
- **AND** 用户可选择「未分组」清空分组
