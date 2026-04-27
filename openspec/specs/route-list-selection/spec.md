# route-list-selection Specification

## Purpose
TBD - created by archiving change route-list-selection-and-column-config. Update Purpose after archive.
## Requirements
### Requirement: Route list single-select switching
The system SHALL allow users to switch selection to a different row by clicking on it, without manually deselecting the current row first.

**NOTE**: This requirement remains unchanged. The pagination, sorting, and search features added in change "paging-and-query" do not modify the selection behavior.

#### Scenario: Click different row switches selection
- **WHEN** user clicks on a row that is not currently selected
- **THEN** the selection SHALL switch to the newly clicked row

#### Scenario: Click same row does nothing
- **WHEN** user clicks on the currently selected row
- **THEN** the selection SHALL remain unchanged

#### Scenario: Selection persists across page navigation
- **WHEN** user selects a row, then navigates to a different page
- **THEN** the selection SHALL be cleared (selection does not persist across pages)

#### Scenario: Selection persists across sort
- **WHEN** user selects a row, then sorts by a different column
- **THEN** the selection SHALL be cleared (selection does not persist across sort operations)

#### Scenario: Selection persists across search
- **WHEN** user selects a row, then performs a search
- **THEN** the selection SHALL be cleared (selection does not persist across search operations)

