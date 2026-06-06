# cluster-list-page Specification

## Purpose

集群管理列表页面，位于 `/clusters` 路由，以卡片网格展示所有集群的统计信息和状态，支持分组展示、搜索筛选、CRUD 操作。与集中管理页面（CentralList.vue）完全独立。

## Requirements

### Requirement: Cluster list page with card grid

The `/clusters` route SHALL provide a cluster management list page with a responsive card grid layout.

#### Scenario: Page loads cluster list
- **WHEN** the user navigates to `/clusters`
- **THEN** the page SHALL fetch the cluster list
- **AND** display clusters in a responsive multi-column card grid

#### Scenario: Permission-based cluster visibility
- **WHEN** the current user has role "admin"
- **THEN** the page SHALL call `GET /api/v1/clusters` to get all clusters
- **WHEN** the current user has a non-admin role
- **THEN** the page SHALL call `GET /api/v1/clusters/my` to get only assigned clusters
- **AND** the page SHALL NOT show clusters the user does not have access to

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
- **AND** the dropdown options SHALL include "未分类" as an option for clusters with empty `group_name`
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

#### Scenario: Group headers with expand/collapse
- **WHEN** a group header is displayed
- **THEN** clicking the group header SHALL toggle the group's expand/collapse state
- **AND** all groups SHALL be expanded by default

#### Scenario: Group sorting
- **WHEN** groups are displayed
- **THEN** named groups SHALL be sorted alphabetically
- **AND** "未分类" group SHALL appear last

### Requirement: Cluster detail view

The page SHALL provide a detail modal for viewing cluster information.

#### Scenario: View cluster detail
- **WHEN** the user clicks "详情" on a cluster card
- **THEN** a modal SHALL open showing: cluster name, display name, group name, description, status badge, admin_key, creation time
- **AND** a resource statistics grid with 7 categories (node, upstream, route, plugin config, global rule, plugin metadata, static resource)
- **AND** a node list with IP:port tags and online/offline status indicators

### Requirement: Cluster CRUD operations

The page SHALL support creating, editing, testing, and deleting clusters.

#### Scenario: Add cluster
- **WHEN** the user clicks "新建集群" button
- **THEN** a modal SHALL open with form fields: name, display_name, group_name (select with inline add), description, admin_key, status

#### Scenario: Edit cluster (name is read-only)
- **WHEN** the user clicks "编辑" on a cluster card
- **THEN** the same modal SHALL open pre-filled with the cluster's current values
- **AND** the name field SHALL be disabled (cannot be changed after creation)
- **AND** the name field SHALL show real-time validation error for format mismatch

#### Scenario: Name validation on create
- **WHEN** the user types a cluster name in the add modal
- **THEN** the name SHALL be validated in real-time against pattern `/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/`
- **AND** SHALL show inline error if the format is invalid

#### Scenario: Test connectivity with per-node results
- **WHEN** the user clicks "测试" on a cluster card
- **THEN** a modal SHALL open showing each node (IP:port) with its connection test result (success/failure)
- **AND** the system SHALL call `POST /clusters/{id}/test` which tests each node's connectivity

#### Scenario: Delete cluster with confirmation flow
- **WHEN** the user clicks "删除集群" from the dropdown menu
- **THEN** the system SHALL fetch nodes and resource stats
- **AND** SHALL show a confirmation dialog with resource counts, DB/Edge delete options, and node selection
- **AND** SHALL require the user to type the cluster name to confirm
- **AND** SHALL execute deletion with a progress modal
- **AND** the delete flow SHALL reuse `showDeleteConfirm` and `executeDeleteWithProgress` from `useClusterUtils`
