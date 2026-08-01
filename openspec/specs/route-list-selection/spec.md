# route-list-selection Specification

## Purpose
TBD - created by archiving change route-list-selection-and-column-config. Update Purpose after archive.
## Requirements
### Requirement: Route list single-select switching
The system SHALL allow users to switch the single selection (`selectedRoute`) to a different row by clicking on it, without manually deselecting the current row first.

**NOTE**: Single selection is driven by the row click handler (`customRow` onClick), not by the checkbox column. The batch selection (checkbox column) is covered by the "Route batch selection" requirement.

**NOTE**: The pagination, sorting, and search features added in change "paging-and-query" do not modify the single selection behavior.

#### Scenario: Click different row switches selection
- **WHEN** user clicks on a row that is not currently selected
- **THEN** the single selection SHALL switch to the newly clicked row

#### Scenario: Click same row does nothing
- **WHEN** user clicks on the currently selected row
- **THEN** the single selection SHALL remain unchanged

#### Scenario: Single selection persists across page navigation
- **WHEN** user single-selects a row, then navigates to a different page
- **THEN** the single selection SHALL be cleared (selection does not persist across pages)

#### Scenario: Single selection persists across sort
- **WHEN** user single-selects a row, then sorts by a different column
- **THEN** the single selection SHALL be cleared (selection does not persist across sort operations)

#### Scenario: Single selection persists across search
- **WHEN** user single-selects a row, then performs a search
- **THEN** the single selection SHALL be cleared (selection does not persist across search operations)

#### Scenario: Single selection cleared when two or more rows checked
- **WHEN** user checks two or more rows via the batch selection column
- **THEN** the single selection SHALL be set to null
- **THEN** single-selection buttons (复制/编辑/发布/版本管理) SHALL be disabled
- **AND** clicking a row afterwards SHALL NOT re-enable the single-selection buttons while two or more rows remain checked

### Requirement: Route batch selection
The system SHALL provide a checkbox-based batch selection state (`selectedRouteKeys`) on the routes table, independent of the single selection (`selectedRoute`).

#### Scenario: Checkbox toggles batch selection
- **WHEN** user checks a row's checkbox in the selection column
- **THEN** the route's id SHALL be added to the batch selection keys
- **WHEN** user unchecks a row's checkbox
- **THEN** the route's id SHALL be removed from the batch selection keys

#### Scenario: Check exactly one row syncs single selection
- **WHEN** user checks exactly one row via the checkbox column
- **THEN** the single selection SHALL be set to that row (single-selection buttons remain usable)

#### Scenario: Batch selection persists across page navigation
- **WHEN** user checks rows on one page, then navigates to a different page
- **THEN** the batch selection keys SHALL be preserved (preserveSelectedRowKeys)
- **WHEN** user navigates back to the original page
- **THEN** the previously checked rows SHALL still appear checked

#### Scenario: Batch selection cleared on search or sort
- **WHEN** user checks rows, then performs a search or sorts by a column
- **THEN** the batch selection keys SHALL be cleared

#### Scenario: DNS routes cannot be checked
- **WHEN** a route has a DNS-related plugin (plugin_name === 'dns_upstream')
- **THEN** its checkbox SHALL be disabled and uncheckable (getCheckboxProps)

#### Scenario: Batch selection cleared after delete
- **WHEN** a batch delete completes
- **THEN** the batch selection keys SHALL be cleared
