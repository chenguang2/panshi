# Spec Delta

## MODIFIED Requirements

### Requirement: Sidebar navigation layout

The system SHALL provide a left-side vertical navigation bar with collapsible sections (分组) for the authenticated layout. Section and item visibility SHALL be filtered by feature flags and user permissions; the active route's section SHALL always be expanded.

#### Scenario: Sidebar displays navigation items
- **WHEN** the user loads any page under the authenticated layout
- **THEN** the sidebar SHALL display the following sections and navigation items (feature/permission filtered):
  - **核心功能**: 概览, 集群管理, 节点管理, 上游管理, 路由管理, 插件组, 插件元数据, 全局规则, 静态资源
  - **证书管理** (positioned after 核心功能): CA 根证书 (`/ssl/ca`), 服务器证书 (`/ssl/server`) — both gated by the `ssl_cert` feature and `ssl_cert` permission
  - **边缘网络**: edge.env 配置, 四层代理, DNS代理[UDP], DNS代理[HTTP]
  - **综合**: 统一管理, 指标查询, 指标总览 (metrics feature)
  - **系统管理**: 插件开关, 数据库管理, 数据迁移, 备份与容灾, 审计日志, ClickHouse 配置, 中继区域管理, 用户管理 (feature/permission/adminOnly gated)
  - **运维管理**: Edge直连, 数据导入, 工具箱, 自启动管理, Ansible 主机清单, 节点任务
- **AND** the current active page SHALL be highlighted in the sidebar
- **AND** sections with zero visible items SHALL NOT render

#### Scenario: Section collapse/expand
- **WHEN** the user clicks a section title
- **THEN** that section's items SHALL collapse or expand
- **AND** the expanded/collapsed state SHALL persist across page navigation
- **WHEN** the active route belongs to a collapsed section
- **THEN** that section SHALL auto-expand so the highlighted item stays visible

#### Scenario: Sidebar collapse/expand
- **WHEN** the user clicks the sidebar collapse trigger
- **THEN** the sidebar SHALL collapse to a narrow icon-only mode
- **AND** text labels (section titles, item labels) SHALL be hidden
- **AND** the collapsed/expanded state SHALL persist across page navigation

#### Scenario: Sidebar dark theme
- **WHEN** the sidebar is rendered
- **THEN** it SHALL follow the global theme variables (surface background in light theme) instead of the historical hardcoded `#001529`

#### Scenario: Sidebar logo
- **WHEN** the sidebar is rendered
- **THEN** the "磐石 Admin" logo (icon + name + version) SHALL be displayed at the top
