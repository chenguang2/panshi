## Purpose

Left-side vertical navigation bar for authenticated layout, replacing the top horizontal menu.

## Requirements

### Requirement: Sidebar navigation layout

The system SHALL provide a left-side vertical navigation bar replacing the existing top horizontal menu.

#### Scenario: Sidebar displays navigation items
- **WHEN** the user loads any page under the authenticated layout
- **THEN** the sidebar SHALL display the following sections and navigation items:
  - **核心功能**: 仪表盘, 节点管理, 上游管理, 路由管理, 插件组, 全局规则, 插件元数据, 静态资源
  - **综合**: 集中管理
  - **系统管理** (admin only): 插件开关, 用户管理
  - **Edge功能** (permission-based): 边缘节点, 数据导入, 工具箱
- **AND** the current active page SHALL be highlighted in the sidebar

#### Scenario: Sidebar collapse/expand
- **WHEN** the user clicks the sidebar collapse trigger
- **THEN** the sidebar SHALL collapse to a narrow icon-only mode
- **AND** expanded text labels SHALL be hidden
- **AND** the collapsed/expanded state SHALL persist across page navigation

#### Scenario: Sidebar dark theme
- **WHEN** the sidebar is rendered
- **THEN** it SHALL default to dark theme background (#001529)
- **AND** navigation items SHALL follow the current theme settings

#### Scenario: Sidebar logo
- **WHEN** the sidebar is rendered
- **THEN** the "磐石" logo SHALL be displayed at the top
- **AND** clicking the logo SHALL navigate to the dashboard

### Requirement: Navigation menu reflects permissions

The sidebar navigation SHALL respect user permissions and role.

#### Scenario: Admin sees system management
- **WHEN** the current user has role "admin"
- **THEN** the sidebar SHALL display "系统管理" section containing "用户管理"

#### Scenario: Non-admin hides system management
- **WHEN** the current user has role other than "admin"
- **THEN** the sidebar SHALL NOT display "系统管理" or "用户管理"

#### Scenario: Permission-based menu items
- **WHEN** the user lacks "edge_nodes" permission
- **THEN** the "边缘节点" navigation item SHALL be hidden
