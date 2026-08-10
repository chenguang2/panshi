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
- **AND** target nodes SHALL display `host:port` (host 可以是 IP 或域名)

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
- **THEN** target node address SHALL accept IPv4、IPv6（`::1` or `[::1]`）、domain name
- **THEN** target node address SHALL be auto-detected and validated accordingly
- **AND** invalid address SHALL display a specific error message
- **AND** IPv6 address without brackets SHALL be automatically wrapped as `[::1]` when building target string
- **ON SAVE** the upstream SHALL be created via existing API

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

### Requirement: 上游复制

上游管理 SHALL 支持复制现有上游，基于其完整配置（含高级配置）快速创建相似上游。

#### Scenario: 操作按钮提供复制
- **WHEN** 用户在集群上游 Tab 或全局上游管理页展开上游操作菜单
- **THEN** 菜单 SHALL 包含「复制」选项
- **THEN** 复制 SHALL 在默认操作按钮中（defaultActions 含 copy），未配置列选项的新用户默认可见

#### Scenario: 复制后状态复位
- **WHEN** 用户复制后关闭弹窗，再点击「添加上游」或「编辑」
- **THEN** 标题 SHALL 显示「添加上游」/「编辑上游」（非「复制上游」），名称 SHALL NOT 残留「复制_」前缀

#### Scenario: 复制填充表单
- **WHEN** 用户点击「复制」
- **THEN** 表单 SHALL 打开并显示标题「复制上游」
- **THEN** 名称 SHALL 为「复制_源上游名」
- **THEN** 负载均衡策略、目标列表、健康检查、超时、连接池、重试等高级配置 SHALL 与源上游一致

#### Scenario: 复制保存为新建
- **WHEN** 用户在复制表单中点击保存
- **THEN** SHALL 走新建流程（POST），不修改原上游
- **THEN** 新建成功后原上游数据 SHALL 保持不变
