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

#### Scenario: Card displays all resource counts as clickable links
- **WHEN** a cluster card is rendered
- **THEN** it SHALL display seven statistics: node count (healthy/total), upstream count, route count, plugin config count, global rule count, plugin metadata count, and static resource count
- **AND** each statistic SHALL be a clickable link to the corresponding resource management page
- **AND** the node count SHALL display as "healthy/total" format

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

### Requirement: 分组字段必填，默认未分类

集群编辑表单的"分组"字段 SHALL 始终有值，不可为空。

#### Scenario: 新建集群默认未分类
- **WHEN** 用户打开添加集群弹窗
- **THEN** 分组下拉默认显示"未分类"
- **AND** `group_name` 值为空字符串

#### Scenario: 编辑集群显示当前分组
- **WHEN** 用户打开编辑集群弹窗
- **THEN** 分组下拉显示该集群当前分组
- **AND** 用户可选择"未分类"清空分组

### Requirement: 新建分组内嵌在 Select 下拉中

系统 SHALL 在 Select 下拉菜单底部内嵌输入框，替代浏览器原生 prompt()。

#### Scenario: 输入框在分组列表底部
- **WHEN** 用户展开分组下拉
- **THEN** 底部显示输入框 + "添加"按钮
- **AND** 输入分组名后按回车或点"添加"即可创建并选中

### Requirement: 未分组区域支持展开收起

系统 SHALL 为"未分组"区域提供与命名分组一致的展开/收起功能。

#### Scenario: 未分组标题可点击切换
- **WHEN** 用户点击"未分组"标题行
- **THEN** 未分组卡片区域展开或收起

### Requirement: 全部展开/全部收起按钮

系统 SHALL 在搜索栏右侧提供"全部展开"和"全部收起"按钮。

#### Scenario: 全部收起
- **WHEN** 用户点击"全部收起"
- **THEN** 所有分组（含未分组）收起为标题行

#### Scenario: 全部展开
- **WHEN** 用户点击"全部展开"
- **THEN** 所有分组展开显示卡片

#### Scenario: 按钮按需显示
- **WHEN** 有任意分组处于收起状态
- **THEN** 显示"全部展开"按钮
- **WHEN** 有任意分组处于展开状态
- **THEN** 显示"全部收起"按钮

#### Scenario: Tab content loads on click
- **WHEN** the user clicks a tab
- **THEN** the corresponding content SHALL load inside the card
- **AND** the content SHALL be functionally identical to the current implementation

#### Scenario: Disabled tabs when conditions not met
- **WHEN** a cluster has no nodes
- **THEN** the "上游" and "路由" tabs SHALL be disabled
- **AND** SHALL show a tooltip explaining why

### Requirement: 展开卡片后滚动定位到详情区

系统 SHALL 在用户点击"展开"按钮后将页面平滑滚动到该集群的详情区域。

#### Scenario: 点击展开后滚动
- **WHEN** 用户点击集群卡片的"展开"按钮
- **THEN** 页面平滑滚动到该集群的详情区（`.card-expanded`）
- **AND** 使用 `setTimeout(100ms)` 确保 TransitionGroup 动画已开始

### Requirement: 最大化时收起未分组

系统 SHALL 在最大化集群时同时收起"未分组"区域。

#### Scenario: 最大化收起所有分组
- **WHEN** 用户点击最大化按钮
- **THEN** 所有分组（包括未分组）全部收起
- **AND** 还原时未分组保持收起状态

### Requirement: 分组与详情分隔线使用主题色

分组集群列表与下方展开详情区之间的分隔线 SHALL 使用主题色。

#### Scenario: 分隔线颜色
- **WHEN** 详情区（`.expanded-area`）渲染时
- **THEN** 顶部边框使用 `color-mix(in srgb, var(--p-color-primary) 40%, transparent)`
- **AND** 最大化模式下分隔线消失

### Requirement: 标题栏无点击行为

展开集群的标题栏 SHALL 无点击行为，避免用户混淆。

#### Scenario: 标题栏不响应点击
- **WHEN** 用户点击展开集群的标题栏
- **THEN** 不做任何操作
- **AND** 展开、最大化、还原通过右侧按钮操作

