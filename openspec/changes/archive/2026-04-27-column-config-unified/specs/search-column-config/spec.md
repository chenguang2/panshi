# search-column-config Specification

## Purpose
Make search functionality configurable through the column configuration interface, with search enabled by default.

## Requirements

### Requirement: Search visibility configurable
The system SHALL allow users to show or hide the search input for each table through the column configuration popover.

#### Scenario: Hide search input
- **WHEN** user opens the column configuration popover
- **AND** unchecks "显示搜索框" checkbox
- **THEN** the search input SHALL be hidden from the table

#### Scenario: Show search input
- **WHEN** user opens the column configuration popover
- **AND** checks "显示搜索框" checkbox
- **THEN** the search input SHALL be visible in the table

### Requirement: Search enabled by default
The system SHALL have search functionality enabled by default for all tables.

**Default**: 显示搜索框 = true

### Requirement: Search configuration in dedicated row
The system SHALL display the search configuration in a dedicated row within the column configuration popover, separated from column checkboxes.

### Requirement: Search styling
The search input SHALL be compact with a width of 150px and proper spacing with the field selector.

**Styling**: width: 150px, compact mode