# cluster-list-page Delta

## MODIFIED Requirements

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
- **AND** 从未创建集群时 SHALL 显示「还没有集群」并附「新建集群」行动按钮
- **AND** 筛选/搜索后为空 SHALL 显示「没有符合筛选条件的集群」并附「清除筛选」出口（清空搜索与分组筛选并刷新）
- **AND** 集群管理页与统一管理页 SHALL 使用一致的两分支空状态语义

### Requirement: Cluster card displays key information

Each cluster card SHALL display essential information.

#### Scenario: Card header
- **WHEN** a cluster card is rendered
- **THEN** the card header SHALL display the cluster display name, group name, and a status badge (已启用/已禁用)
- **AND** the group name SHALL be shown in the card header area
- **AND** 空分组 SHALL 统一显示为「未分组」（全站唯一术语，SHALL NOT 使用「未分类」）

#### Scenario: 发布状态微标
- **WHEN** a cluster card is rendered
- **THEN** meta 区 SHALL 显示集群发布状态微标：「未发布」（灰，`current_version` 为空）或「配置 vN」（绿，非空，即集群级配置 edge.env 已发布版本）
- **AND** tooltip SHALL 说明「集群配置（edge.env）版本；子资源发布不推进此版本」
- **AND** 微标 SHALL 为独立迷你徽章，MUST NOT 复用 `PublishStatusTag`（其四态 pending/partial 逻辑与集群语义不同）

#### Scenario: 健康节点数分级着色
- **WHEN** a cluster card is rendered
- **THEN** 健康节点统计格 SHALL 按健康度着色：健康数为 0 红、健康数少于总数橙、全部健康默认色

#### Scenario: 路径徽章降噪
- **WHEN** 渲染卡片时
- **THEN** 路径徽章 SHALL 仅在「中继可用 且 该集群已绑定区域」时渲染（经中继/直连二态）
- **AND** 中继关闭、区域数据不可用或集群未绑定区域时 `routeBadge` SHALL 为 null，SHALL NOT 渲染徽章（现行未绑区域集群也显示「直连」的行为属噪音，SHALL 移除）

#### Scenario: Card statistics
- **WHEN** a cluster card is rendered
- **THEN** it SHALL display seven statistics: node count (healthy/total), upstream count, route count, plugin config count, global rule count, plugin metadata count, and static resource count

#### Scenario: Card actions
- **WHEN** a cluster card is rendered
- **THEN** actions 区 SHALL 统一展示「详情 / 连接测试 / 编辑 / 删除」，删除恒位于最右且为危险色
- **AND** 集群管理页与统一管理页 SHALL 使用相同顺序与样式（样式基准：「详情」为 btn-secondary 主按钮，连接测试/编辑为 ghost，「删除」为 danger）
- **AND** it SHALL NOT display a "同步" button

#### Scenario: Node tags
- **WHEN** a cluster card is rendered and the cluster has nodes
- **THEN** the card SHALL display node tags (IP:port) with online/offline status indicators

#### Scenario: Shared component rendering
- **WHEN** a cluster card is rendered on the cluster management page or the unified management page
- **THEN** the card SHALL be rendered by the shared `ClusterCard.vue` component
- **AND** both pages SHALL present identical card anatomy, including the relay/direct path badge

### Requirement: Cluster search and filter

The cluster list page SHALL provide search and filtering capabilities.

#### Scenario: Search by keyword
- **WHEN** the user types in the search input
- **THEN** the card grid SHALL filter to show only clusters whose name or display name matches the query

#### Scenario: Filter by group name
- **WHEN** the user selects a group name from the dropdown
- **THEN** the card grid SHALL filter to show only clusters belonging to that group
- **AND** the dropdown options SHALL include 「未分组」 as an option for clusters with empty `group_name`
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
- **AND** clusters with empty `group_name` SHALL be in a 「未分组」 group

#### Scenario: Group headers with expand/collapse
- **WHEN** a group header is displayed
- **THEN** clicking the group header SHALL toggle the group's expand/collapse state
- **AND** all groups SHALL be expanded by default

#### Scenario: Group sorting
- **WHEN** groups are displayed
- **THEN** named groups SHALL be sorted alphabetically
- **AND** 「未分组」 group SHALL appear last

### Requirement: Cluster detail view

The page SHALL provide a detail modal for viewing cluster information.

#### Scenario: View cluster detail
- **WHEN** the user clicks "详情" on a cluster card
- **THEN** a modal SHALL open showing: cluster name, display name, group name, description, status badge (已启用/已禁用), 所属区域（无区域显示「直连」）, 发布状态（未发布/配置 vN）, admin_key, creation time
- **AND** a resource statistics grid with 7 categories (node, upstream, route, plugin config, global rule, plugin metadata, static resource)
- **AND** a node list with IP:port tags and online/offline status indicators

#### Scenario: 共享详情组件
- **WHEN** 集群管理页或统一管理页打开集群详情
- **THEN** SHALL 渲染共享组件 `ClusterDetailModal.vue`（标题含集群名，两页内容集一致：基本信息、7 项统计、节点列表）
- **AND** 页面 SHALL NOT 各自内联两份详情弹窗实现

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
- **AND** the name field SHALL 附 hint：「集群名称是固定标识，创建后不可修改；如需调整对外名称请修改『显示名称』」

#### Scenario: Name validation on create
- **WHEN** the user types a cluster name in the add modal
- **THEN** the name SHALL be validated in real-time against pattern `/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/`
- **AND** SHALL show inline error if the format is invalid

#### Scenario: Test connectivity with per-node results
- **WHEN** the user clicks "测试" on a cluster card
- **THEN** a modal SHALL open showing each node (IP:port) with its connection test result (success/failure)
- **AND** the system SHALL call `POST /clusters/{id}/test`（交互语义见 `cluster-test-connection` 能力）

#### Scenario: Delete cluster with confirmation flow
- **WHEN** the user clicks "删除集群" from the dropdown menu
- **THEN** the system SHALL fetch nodes and resource stats
- **AND** SHALL show a confirmation dialog with resource counts, DB/Edge delete options, and node selection
- **AND** SHALL require the user to type the cluster name to confirm
- **AND** SHALL execute deletion with a progress modal
- **AND** the delete flow SHALL reuse `showDeleteConfirm` and `executeDeleteWithProgress` from `useClusterUtils`
- **AND** 节点/统计接口失败时 SHALL NOT 降级删除语义（确认弹窗照常弹出并照常执行删除，详见 `cluster-delete-stats` 能力）

## ADDED Requirements

### Requirement: 集群表单交互保护

集群新建/编辑表单 SHALL 提供误关保护与关键提示；区域引导 SHALL 补齐「下发后回集群执行连接测试」的链路终点。

#### Scenario: 未保存修改误关保护
- **WHEN** 表单存在未保存修改且用户点击 × 或「取消」
- **THEN** 系统 SHALL 经 `useOverlayModal` 确认「更改尚未保存，确定放弃？」
- **WHEN** 表单无修改
- **THEN** 关闭 SHALL NOT 出现确认

#### Scenario: 区域列表加载失败提示
- **WHEN** 表单的区域下拉数据加载失败
- **THEN** SHALL 显示警示「区域列表加载失败，当前仅可直连」，MUST NOT 静默只展示「直连（无中继）」致用户误以为平台无中继能力

#### Scenario: 区域引导补测试闭环
- **WHEN** 区域绑定/换绑保存成功触发「需下发网关配置」引导
- **THEN** 引导正文 SHALL 末尾追加「下发完成后，请回到集群卡片执行『连接测试』确认节点可达」
