## ADDED Requirements

### Requirement: Default route columns configuration
The system SHALL display default columns as: Name, URI, Priority, Actions.

#### Scenario: Default columns shown on route tab load
- **WHEN** user opens the route tab of a cluster
- **THEN** the table SHALL display columns: 名称, URI, 优先级, 操作

### Requirement: Actions column visibility toggle
The system SHALL allow users to show or hide the Actions column through the column configuration popover.

#### Scenario: Actions column can be hidden
- **WHEN** user opens column configuration and unchecks "操作"
- **THEN** the Actions column SHALL NOT be displayed in the table

#### Scenario: Actions column can be shown
- **WHEN** user opens column configuration and checks "操作"
- **THEN** the Actions column SHALL be displayed in the table