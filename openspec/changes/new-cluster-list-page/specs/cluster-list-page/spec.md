## ADDED Requirements

### Requirement: Cluster list page with card grid

The `/clusters` route SHALL provide a cluster management list page with a responsive card grid layout.

#### Scenario: Page loads cluster list
- **WHEN** the user navigates to `/clusters`
- **THEN** the page SHALL fetch cluster list from `GET /api/v1/clusters` (or `/my` for non-admin)
- **AND** display clusters in a responsive multi-column card grid

#### Scenario: Card grid responsiveness
- **WHEN** the viewport width is ≥ 1200px
- **THEN** the grid SHALL display at least 3 columns
- **WHEN** the viewport width is between 768px and 1199px
- **THEN** the grid SHALL display 2 columns
- **WHEN** the viewport width is < 768px
- **THEN** the grid SHALL display 1 column

#### Scenario: Empty state
- **WHEN** no clusters exist or none match filters
- **THEN** the page SHALL display an empty state message

### Requirement: Cluster card displays key information

Each cluster card SHALL display essential information.

#### Scenario: Card header
- **WHEN** a cluster card is rendered
- **THEN** the card header SHALL display the cluster display name, group name, and a status badge (运行中/已禁用)
- **AND** the group name SHALL be shown in the card header area

#### Scenario: Card statistics
- **WHEN** a cluster card is rendered
- **THEN** it SHALL display seven statistics: node count (healthy/total), upstream count, route count, plugin config count, global rule count, plugin metadata count, and static resource count

#### Scenario: Card actions
- **WHEN** a cluster card is rendered
- **THEN** it SHALL display "详情", "编辑", "测试" action buttons
- **AND** it SHALL NOT display a "同步" button
- **AND** it SHALL provide a dropdown menu with "删除集群" action

#### Scenario: Node tags
- **WHEN** a cluster card is rendered and the cluster has nodes
- **THEN** the card SHALL display node tags (IP:port) with online/offline status indicators

### Requirement: Cluster search and filter

The cluster list page SHALL provide search and filtering capabilities.

#### Scenario: Search by keyword
- **WHEN** the user types in the search input
- **THEN** the card grid SHALL filter to show only clusters whose name or display name matches the query

#### Scenario: Filter by group name
- **WHEN** the user selects a group name from the dropdown
- **THEN** the card grid SHALL filter to show only clusters belonging to that group
- **AND** the dropdown options SHALL be dynamically populated from cluster group names

#### Scenario: Combined search and group filter
- **WHEN** the user types a search query AND selects a group filter
- **THEN** both filters SHALL be applied simultaneously

### Requirement: Group-based categorization

Clusters SHALL be organized into groups with group headers.

#### Scenario: Group headers
- **WHEN** clusters are rendered
- **THEN** they SHALL be grouped by `group_name`
- **AND** each group SHALL display a group header with the group name and cluster count
- **AND** clusters with empty `group_name` SHALL be in a "未分类" group

#### Scenario: Group sorting
- **WHEN** groups are displayed
- **THEN** named groups SHALL be sorted alphabetically
- **AND** "未分类" group SHALL appear last

### Requirement: Cluster CRUD operations

The page SHALL support creating, editing, testing, and deleting clusters.

#### Scenario: Add cluster
- **WHEN** the user clicks "新建集群" button
- **THEN** a modal SHALL open with form fields: name, display_name, group_name (select with inline add), description, admin_key, status

#### Scenario: Edit cluster
- **WHEN** the user clicks "编辑" on a cluster card
- **THEN** the same modal SHALL open pre-filled with the cluster's current values

#### Scenario: Test connectivity
- **WHEN** the user clicks "测试" on a cluster card
- **THEN** the system SHALL test the cluster connection
- **AND** display a success/error result message

#### Scenario: Delete cluster
- **WHEN** the user clicks "删除集群" from the dropdown menu
- **THEN** a confirmation dialog SHALL be shown
- **AND** after confirmation the cluster SHALL be deleted
