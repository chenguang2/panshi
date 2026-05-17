# cluster-card-grid Specification

## Purpose
TBD - created by archiving change ui-beautification. Update Purpose after archive.
## Requirements
### Requirement: Responsive card grid layout

The cluster list page SHALL display clusters in a responsive multi-column card grid instead of a single-column stack.

#### Scenario: Grid displays 3 columns on wide screen
- **WHEN** the viewport width is ≥ 1200px
- **THEN** clusters SHALL be displayed in a grid with at least 3 columns
- **AND** each card SHALL be visually uniform in width

#### Scenario: Grid displays 2 columns on medium screen
- **WHEN** the viewport width is between 768px and 1199px
- **THEN** clusters SHALL be displayed in a grid with 2 columns

#### Scenario: Grid displays 1 column on narrow screen
- **WHEN** the viewport width is < 768px
- **THEN** clusters SHALL be displayed in a single column

### Requirement: Cluster card shows key metrics

Each cluster card SHALL display essential information at a glance.

#### Scenario: Card displays cluster name and status
- **WHEN** a cluster card is rendered
- **THEN** it SHALL display the cluster display name, internal name hint, and a health status indicator (healthy/offline/warning)

#### Scenario: Card displays node/upstream/route counts
- **WHEN** a cluster card is rendered
- **THEN** it SHALL display three statistics: node count (healthy/total), upstream count, and route count

#### Scenario: Card shows action buttons
- **WHEN** a cluster card is rendered
- **THEN** it SHALL display "编辑" and "删除" action buttons

### Requirement: Cluster search and filter

The cluster list page SHALL provide search and filtering capabilities.

#### Scenario: Search by cluster name
- **WHEN** the user types in the search input
- **THEN** the card grid SHALL filter to show only clusters whose name or display name matches the query

#### Scenario: Filter by status
- **WHEN** the user clicks a status filter tag (健康/离线/告警)
- **THEN** the card grid SHALL filter to show only clusters matching that status

#### Scenario: Combined search and filter
- **WHEN** the user types a search query AND selects a status filter
- **THEN** both filters SHALL be applied simultaneously

### Requirement: Cluster tabs preserved in card

Each cluster card SHALL retain the existing tab navigation for detailed management.

#### Scenario: Tabs displayed in card
- **WHEN** a cluster card is rendered
- **THEN** it SHALL display the same tabs as the current implementation: 集群节点, 上游, 路由, 插件元数据, 插件组, 全局规则, 静态资源

#### Scenario: Tab content loads on click
- **WHEN** the user clicks a tab
- **THEN** the corresponding content SHALL load inside the card
- **AND** the content SHALL be functionally identical to the current implementation

#### Scenario: Disabled tabs when conditions not met
- **WHEN** a cluster has no nodes
- **THEN** the "上游" and "路由" tabs SHALL be disabled
- **AND** SHALL show a tooltip explaining why

