# Upstream Management

## Purpose

Provide a dedicated page for admins to manage upstream services across all clusters from a single view.

## Requirements

### Requirement: Upstream management page

Admins SHALL be able to view, search, filter, create, edit, delete, publish, and version-manage upstreams from a dedicated page.

#### Scenario: Page layout
- **WHEN** admin navigates to `/upstreams`
- **THEN** a page SHALL display with PageHeader title "上游管理"
- **THEN** a cluster filter dropdown SHALL be in the page header area
- **THEN** a "新建上游" button SHALL be in the page header

#### Scenario: Filter bar
- **WHEN** the page loads
- **THEN** a search input SHALL filter by name/description
- **THEN** a load-balance algorithm dropdown SHALL filter (全部/加权轮询/一致性哈希/EWMA/最少连接)
- **THEN** a count SHALL show "共 N 个上游"

#### Scenario: Table display
- **WHEN** upstreams exist
- **THEN** a table SHALL show columns: name+description, cluster, load-balance algorithm, target nodes, protocol, version, created time, actions
- **THEN** target nodes SHALL display as tags with weight
- **THEN** load-balance algorithm SHALL display as a badge
- **THEN** pagination SHALL be supported

### Requirement: Upstream HTTPS scheme

The upstream scheme field SHALL support `https` in addition to `http` for upstream connections.

#### Scenario: Upstream scheme selection
- **WHEN** user edits an upstream
- **THEN** the scheme dropdown SHALL include `https` as an option
- **AND** selecting `https` SHALL enable additional SSL verification options (`https_verify_certificate`)

#### Scenario: Action menu
- **WHEN** admin clicks the action button (⋯) on a row
- **THEN** a dropdown SHALL show: 编辑, 发布, 版本管理, 删除
- **THEN** 回滚 SHALL NOT appear in the menu

#### Scenario: Create upstream
- **WHEN** admin clicks "新建上游"
- **THEN** a modal SHALL open with fields: name, 所属集群, load-balance algorithm, protocol, description, pass host, retries, target nodes
- **THEN** 所属集群 SHALL be required and selectable from existing clusters
- **THEN** target nodes SHALL support add/remove rows
- **ON SAVE** the upstream SHALL be created via existing API

#### Scenario: Edit upstream
- **WHEN** admin clicks "编辑" in action menu
- **THEN** the same modal SHALL open with existing data pre-filled
- **THEN** 所属集群 SHALL be editable

#### Scenario: Delete upstream
- **WHEN** admin clicks "删除"
- **THEN** a confirmation SHALL appear
- **ON CONFIRM** the upstream SHALL be deleted via existing API

#### Scenario: Publish upstream
- **WHEN** admin clicks "发布"
- **THEN** the existing publish modal SHALL appear

#### Scenario: Version management
- **WHEN** admin clicks "版本管理"
- **THEN** the existing version management modal SHALL appear

#### Scenario: Cluster filter
- **WHEN** admin selects a cluster from the dropdown
- **THEN** only upstreams belonging to that cluster SHALL be shown
- **WHEN** "全部集群" is selected
- **THEN** upstreams from all clusters SHALL be shown

#### Scenario: Cross-cluster upstream list
- **WHEN** the page loads with "全部集群" selected
- **THEN** upstreams from all clusters SHALL be fetched from `GET /api/v1/upstreams`

#### Scenario: Cluster field in create modal
- **WHEN** admin opens "新建上游" modal
- **THEN** a "所属集群" dropdown SHALL be present and required
- **THEN** the cluster list SHALL be loaded from `GET /api/v1/clusters`

#### Scenario: Cluster field in edit modal
- **WHEN** admin opens "编辑" modal
- **THEN** the "所属集群" field SHALL be displayed as read-only (disabled)
- **THEN** the cluster SHALL NOT be changeable during edit
