# upstream-column-config Specification

## Purpose
Add column configuration capability to the upstream table, allowing users to show/hide columns and configure action buttons.

## Requirements

### Requirement: Upstream table column visibility
The system SHALL allow users to configure which columns are visible in the upstream table through a column configuration popover.

#### Scenario: Toggle column visibility
- **WHEN** user opens the column configuration popover for upstream table
- **AND** unchecks "名称" checkbox
- **THEN** the "名称" column SHALL be hidden from the upstream table

#### Scenario: Show hidden column
- **WHEN** user opens the column configuration popover for upstream table
- **AND** checks "名称" checkbox
- **THEN** the "名称" column SHALL be visible in the upstream table

### Requirement: Upstream action buttons configuration
The system SHALL allow users to configure which action buttons are visible in the upstream table action column.

#### Scenario: Hide action button
- **WHEN** user opens the column configuration popover for upstream table
- **AND** unchecks "发布" from action buttons
- **THEN** the "发布" button SHALL be hidden from the upstream action column

#### Scenario: Show action button
- **WHEN** user opens the column configuration popover for upstream table
- **AND** checks "发布" from action buttons
- **THEN** the "发布" button SHALL be visible in the upstream action column

### Requirement: Default upstream columns
The system SHALL display default columns when no user configuration exists.

**Default columns**: 名称, 负载均衡, 描述, 操作