# node-column-config Specification

## Purpose
Add column configuration capability to the node table, allowing users to show/hide columns.

## Requirements

### Requirement: Node table column visibility
The system SHALL allow users to configure which columns are visible in the node table through a column configuration popover.

#### Scenario: Toggle column visibility
- **WHEN** user opens the column configuration popover for node table
- **AND** unchecks "IP" checkbox
- **THEN** the "IP" column SHALL be hidden from the node table

#### Scenario: Show hidden column
- **WHEN** user opens the column configuration popover for node table
- **AND** checks "IP" checkbox
- **THEN** the "IP" column SHALL be visible in the node table

### Requirement: Default node columns
The system SHALL display default columns when no user configuration exists.

**Default columns**: IP, 服务端口, 管理端口, 状态, 操作