# table-sorting Specification

## Purpose
Define sorting behavior for table columns in cluster management (routes, upstreams, nodes).

## ADDED Requirements

### Requirement: Sortable columns
The system SHALL allow users to sort table data by clicking on column headers.

#### Scenario: Click sortable column header
- **WHEN** user clicks on a sortable column header (名称, URI, 优先级, 状态, 创建时间)
- **THEN** the table SHALL sort data by that column in ascending order

### Requirement: Toggle sort direction
The system SHALL toggle between ascending and descending order when the same column header is clicked again.

#### Scenario: Click same column toggles to descending
- **WHEN** user clicks on a column header that is currently sorted ascending
- **THEN** the table SHALL re-sort data in descending order

#### Scenario: Click same column toggles back to ascending
- **WHEN** user clicks on a column header that is currently sorted descending
- **THEN** the table SHALL re-sort data in ascending order

### Requirement: Visual sort indicator
The system SHALL display a visual indicator (arrow icon) showing the current sort direction on the sorted column.

#### Scenario: Ascending sort indicator
- **WHEN** data is sorted ascending by a column
- **THEN** an upward arrow icon SHALL appear on that column header

#### Scenario: Descending sort indicator
- **WHEN** data is sorted descending by a column
- **THEN** a downward arrow icon SHALL appear on that column header

### Requirement: Sortable fields
The sortable fields for routes SHALL include: name, uri, priority, status, created_at.

#### Scenario: Sort by name
- **WHEN** user clicks "名称" column header
- **THEN** routes SHALL be sorted alphabetically by name

#### Scenario: Sort by priority
- **WHEN** user clicks "优先级" column header
- **THEN** routes SHALL be sorted numerically by priority

### Requirement: API sort parameters
The system SHALL pass sort parameters to the API: sort_by (field name) and sort_order (asc/desc).

#### Scenario: API receives sort parameters
- **WHEN** user sorts by "名称" ascending
- **THEN** API SHALL receive `sort_by=name&sort_order=asc`
