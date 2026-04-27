# route-actions-config Specification

## Purpose
TBD - created by archiving change route-list-selection-and-column-config. Update Purpose after archive.
## Requirements
### Requirement: Actions column button configuration
The system SHALL allow users to configure which action buttons are displayed in the Actions column.

#### Scenario: User can select which buttons to display
- **WHEN** user opens column configuration
- **THEN** the system SHALL display checkboxes for: 发布, 版本管理, 复制, 编辑, 删除

#### Scenario: Unchecked buttons are not rendered
- **WHEN** user unchecks a button (e.g., "删除") in column configuration
- **THEN** that button SHALL NOT be rendered in the Actions column

#### Scenario: Checked buttons are rendered
- **WHEN** user checks a button (e.g., "发布") in column configuration
- **THEN** that button SHALL be rendered in the Actions column

#### Scenario: All buttons shown by default
- **WHEN** user opens column configuration for the first time
- **THEN** all action buttons (发布, 版本管理, 复制, 编辑, 删除) SHALL be checked by default

