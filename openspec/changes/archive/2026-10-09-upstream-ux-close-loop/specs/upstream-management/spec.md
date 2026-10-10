# upstream-management Delta

## MODIFIED Requirements

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
- **THEN** a load-balance algorithm dropdown SHALL filter (全部/加权轮询/一致性哈希/延迟最小/最少连接)
- **AND** `ewma` 值的展示名 SHALL 统一为「延迟最小」（徽章、筛选选项与表单/集群子页一致；API 值不变）
- **THEN** a count SHALL show "共 N 个上游"

#### Scenario: Table display
- **WHEN** upstreams exist
- **THEN** a table SHALL show columns: name+description, cluster, load-balance algorithm, target nodes, protocol, publish status, actions
- **THEN** target nodes SHALL display as tags with weight
- **THEN** load-balance algorithm SHALL display as a badge（`ewma` 显示为「延迟最小」）
- **THEN** publish status SHALL 使用 PublishStatusTag 四态并附带最近发布时间（数据源见 `upstream-publish-status` 能力），SHALL 合并原「版本」列并以之替代「创建时间」列
- **THEN** protocol SHALL 在未配置时显示 `—`，SHALL NOT 显示默认值 `http`
- **THEN** pagination SHALL be supported（a-table 内置分页）
- **AND** target nodes SHALL display `host:port` (host 可以是 IP 或域名)
- **AND** 表头 SHALL NOT 提供仅对当前页数据生效的前端 sorter（服务端未支持排序参数前，列表保持固定排序）

#### Scenario: 行内发布入口
- **WHEN** a row renders
- **THEN** 「发布」SHALL 作为行内主按钮展示（无需展开 ⋯ 菜单）
- **AND** 行内「发布」与引导弹窗「立即发布」SHALL 走同一发布弹窗链路

### Requirement: Upstream HTTPS scheme

The upstream scheme field SHALL support `https` in addition to `http` for upstream connections.

#### Scenario: Upstream scheme selection
- **WHEN** user edits an upstream
- **THEN** the scheme dropdown SHALL include `https` as an option
- **AND** selecting `https` SHALL enable additional SSL verification options (`https_verify_certificate`)

#### Scenario: Action menu
- **WHEN** admin clicks the action button (⋯) on a row
- **THEN** a dropdown SHALL show: 编辑, 版本管理, 复制, 删除
- **AND** 发布 SHALL NOT 出现在 ⋯ 菜单中（已上浮为行内主按钮）
- **THEN** 回滚 SHALL NOT appear in the menu

#### Scenario: Create upstream
- **WHEN** admin clicks "新建上游"
- **THEN** a modal SHALL open with fields: name, 所属集群, load-balance algorithm, protocol, description, pass host, retries, target nodes
- **THEN** 所属集群 SHALL be required and selectable from existing clusters
- **THEN** target nodes SHALL support add/remove rows
- **THEN** target node address SHALL accept IPv4、IPv6（`::1` or `[::1]`）、domain name
- **THEN** target node address SHALL be auto-detected and validated accordingly
- **AND** invalid address SHALL display a specific error message
- **AND** IPv6 address without brackets SHALL be automatically wrapped as `[::1]` when building target string
- **ON SAVE** the upstream SHALL be created via existing API
- **AND** 保存成功提示与后续引导 SHALL 遵循「保存后发布引导」需求

#### Scenario: Edit upstream
- **WHEN** admin clicks "编辑" in action menu
- **THEN** the same modal SHALL open with existing data pre-filled
- **THEN** the target node address SHALL be parsed from stored `target` string correctly for IPv4 / IPv6 / domain
- **AND** IPv6 target `[::1]:80` SHALL parse into host=`[::1]` port=`80`
- **AND** domain target `foo.com:80` SHALL parse into host=`foo.com` port=`80`
- **THEN** 所属集群 SHALL be editable

#### Scenario: Delete upstream
- **WHEN** admin clicks "删除"
- **THEN** a confirmation SHALL appear
- **ON CONFIRM** the upstream SHALL be deleted via existing API

#### Scenario: Publish upstream
- **WHEN** admin clicks "发布"（行内主按钮或保存引导弹窗「立即发布」）
- **THEN** the existing publish modal SHALL appear

#### Scenario: Version management
- **WHEN** admin clicks "版本管理"
- **THEN** the existing version management modal SHALL appear（其回滚/删除语义见 `config-version-management` 能力）

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

## ADDED Requirements

### Requirement: 保存后发布引导

保存上游（新建/编辑/复制保存）成功后，系统 SHALL 明确告知「配置尚未发布」，并提供立即发布的引导出口，MUST NOT 让用户误以为保存即已在 Edge 节点生效。全局表单与集群内表单 SHALL 使用统一文案。

#### Scenario: 保存成功提示语义
- **WHEN** 用户保存上游成功（任一表单入口）
- **THEN** toast SHALL 显示「已保存。配置尚未发布，需发布后才会在 Edge 节点生效」
- **AND** 三处入口（全局表单/集群内联表单/复制保存）SHALL 使用同一文案

#### Scenario: 保存后引导弹窗
- **WHEN** 保存成功提示出现后
- **THEN** 系统 SHALL 经 `useOverlayModal` 弹出引导：「配置尚未发布，发布后才会推送到 Edge 节点生效。」
- **AND** 弹窗 SHALL 提供「稍后」与「立即发布」两个出口
- **AND** 「立即发布」SHALL 打开既有发布确认弹窗（`PublishConfirmModal`）并走共享发布链路
- **AND** 系统 SHALL NOT 未经用户确认自动发布

#### Scenario: 稍后路径不丢失状态
- **WHEN** 用户选择「稍后」
- **THEN** 该上游在列表 SHALL 呈现「待发布」状态（见 `upstream-publish-status`），发布动作保持可达

### Requirement: 空状态引导

列表空状态 SHALL 区分「从未创建」与「筛选后为空」，并为两者提供行动出口。

#### Scenario: 从未创建
- **WHEN** 无任何上游且无筛选条件
- **THEN** 空状态 SHALL 显示「还没有上游」并附「新建上游」行动按钮

#### Scenario: 筛选后为空
- **WHEN** 筛选/搜索条件下结果为空
- **THEN** 空状态 SHALL 显示「没有符合筛选条件的上游」并附「清除筛选」出口
