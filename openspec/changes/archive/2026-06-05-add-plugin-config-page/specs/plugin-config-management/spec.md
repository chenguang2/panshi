## NEW Requirements

### Requirement: Plugin config management page

#### Scenario: Page layout
- **WHEN** admin navigates to `/plugin-configs`
- **THEN** a page SHALL display with PageHeader title "插件组"
- **THEN** a cluster filter dropdown SHALL default to "全部集群"
- **THEN** an "添加插件组" button SHALL be present

#### Scenario: Card grid display
- **WHEN** plugin configs exist
- **THEN** each config SHALL display as a card in a responsive CSS grid
- **THEN** each card SHALL show: name, publish status tag, description, plugin tags, action buttons
- **THEN** action buttons SHALL include: 查看, 编辑, 删除, 发布, 版本管理

#### Scenario: Create/Edit
- **WHEN** admin clicks "添加插件组" or "编辑"
- **THEN** PluginConfigFormModal SHALL open with fields matching cluster plugin config form
- **THEN** "所属集群" SHALL be present (editable on create, readonly on edit)
- **ON SAVE** the config SHALL be created/updated via existing API

#### Scenario: View
- **WHEN** admin clicks "查看"
- **THEN** a drawer SHALL show the plugin config details and JSON preview

#### Scenario: Delete
- **WHEN** admin clicks "删除"
- **THEN** the existing delete function from useClusterPluginConfigs SHALL be used

#### Scenario: Publish
- **WHEN** admin clicks "发布"
- **THEN** the existing publish function SHALL be used

#### Scenario: Version management
- **WHEN** admin clicks "版本管理"
- **THEN** the existing VersionManagementModal SHALL be used
