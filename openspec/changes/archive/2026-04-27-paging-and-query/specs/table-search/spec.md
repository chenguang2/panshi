# table-search Specification

## Purpose
Define search behavior for table lists in cluster management (routes, upstreams, nodes).

## ADDED Requirements

### Requirement: Global fuzzy search
The system SHALL allow users to search across all text fields using a fuzzy search.

#### Scenario: Fuzzy search matches partial text
- **WHEN** user enters "test" in the search box
- **THEN** the table SHALL display items where any field contains "test" (case-insensitive)

#### Scenario: Empty search returns all
- **WHEN** user clears the search box or searches with empty string
- **THEN** the table SHALL display all items without filtering

### Requirement: Column-specific search
The system SHALL allow users to search within a specific column.

#### Scenario: Search by name column
- **WHEN** user selects "名称" column and enters "api"
- **THEN** the table SHALL display only items where name contains "api"

#### Scenario: Search by URI column
- **WHEN** user selects "URI" column and enters "/admin"
- **THEN** the table SHALL display only items where URI contains "/admin"

### Requirement: Search input field
The system SHALL provide a search input field at the top of the table for entering search queries.

#### Scenario: Search input is visible
- **WHEN** user opens the route list tab
- **THEN** a search input field SHALL be visible above the table

### Requirement: Column selector for search
The system SHALL provide a dropdown to select which column to search in, with "全部" (all) as the default option.

#### Scenario: Column selector shows options
- **WHEN** user looks at the search area
- **THEN** a column selector dropdown SHALL be visible with options: 全部, 名称, URI

### Requirement: API search parameters
The system SHALL pass search parameters to the API: search (query string) and search_field (column name, optional).

#### Scenario: API receives search parameters
- **WHEN** user searches for "api" in all columns
- **THEN** API SHALL receive `search=api` and `search_field=` (empty for global)

#### Scenario: API receives column-specific search
- **WHEN** user searches for "test" in name column
- **THEN** API SHALL receive `search=test&search_field=name`
