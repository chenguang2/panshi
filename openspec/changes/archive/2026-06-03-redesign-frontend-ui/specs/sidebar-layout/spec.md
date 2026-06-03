## MODIFIED Requirements

### Requirement: Sidebar navigation layout

Navigation implementation CHANGED from Ant Design `a-menu` to custom section-based sidebar.

#### Scenario: Sidebar displays navigation items in sections (MODIFIED)
- **WHEN** the user loads any page under the authenticated layout
- **THEN** the sidebar SHALL display navigation items organized in sections:
  - **核心功能**: 概览、集群管理、路由管理、上游管理、节点管理、插件组、全局规则、静态资源
  - **系统管理**: 插件管理、用户管理 (admin only)
  - **Edge功能**: Edge直连、数据导入、工具箱
- **AND** each section SHALL display a section group title
- **AND** current active page SHALL be highlighted with accent color
- **REPLACES** previous flat Ant Design menu implementation

#### Scenario: Sidebar collapse/expand (UNCHANGED)
- **WHEN** the user clicks the sidebar collapse trigger
- **THEN** the sidebar SHALL collapse to a narrow icon-only mode
- **AND** expanded text labels SHALL be hidden
- **AND** the collapsed/expanded state SHALL persist across page navigation

#### Scenario: Sidebar dark theme (MODIFIED)
- **WHEN** the sidebar is rendered
- **THEN** it SHALL use `--p-sidebar-bg` CSS variable (not hardcoded #001529)
- **AND** navigation items SHALL reference CSS variables for colors

#### Scenario: Sidebar logo (MODIFIED)
- **WHEN** the sidebar is rendered
- **THEN** the logo SHALL display "磐" character icon with gradient background + "磐石" text + "v1.0" version
- **AND** clicking the logo SHALL navigate to the dashboard

### ADDED Requirements

### Requirement: Bottom user info area

The sidebar SHALL display current user info and logout at the bottom.

#### Scenario: User info and logout
- **WHEN** the sidebar is rendered
- **THEN** the bottom SHALL display user avatar (first character of username), username, role
- **AND** a logout link
- **AND** clicking logout SHALL execute logout and redirect to login page

### Requirement: Navigation section groups

Sidebar navigation items SHALL be organized into collapsible section groups with titles.

#### Scenario: Section group titles visible
- **WHEN** the sidebar is rendered in expanded mode
- **THEN** each section group SHALL display a section title (核心功能/系统管理/Edge功能)
- **AND** section titles SHALL NOT be clickable navigation items
