## NEW Requirements

### Requirement: Global rule management page

#### Scenario: Page layout
- **WHEN** admin navigates to `/global-rules`
- **THEN** a page SHALL display with PageHeader title "全局规则"
- **THEN** a cluster filter dropdown SHALL default to "全部集群"
- **THEN** an "添加全局规则" button SHALL be present

#### Scenario: Card grid display
- **WHEN** global rules exist
- **THEN** each rule SHALL display as a card in a 3-column CSS grid
- **THEN** each card SHALL show: name, publish status, description, plugin tags, action buttons

#### Scenario: Create/Edit
- **WHEN** admin clicks "添加全局规则" or "编辑"
- **THEN** GlobalRuleFormModal SHALL open with fields matching cluster form
- **THEN** "所属集群" SHALL be present (editable on create, readonly on edit)

#### Scenario: View/Delete/Publish/Version management
- **WHEN** admin clicks action buttons
- **THEN** SHALL use the same functions as cluster management (via showDeleteConfirm, PublishConfirmModal, VersionManagementModal, Drawer)
