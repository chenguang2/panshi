# route-list-selection Specification

## Purpose
TBD - created by archiving change route-list-selection-and-column-config. Update Purpose after archive.
## Requirements
### Requirement: Route list single-select switching
The system SHALL allow users to switch selection to a different row by clicking on it, without manually deselecting the current row first.

#### Scenario: Click different row switches selection
- **WHEN** user clicks on a row that is not currently selected
- **THEN** the selection SHALL switch to the newly clicked row

#### Scenario: Click same row does nothing
- **WHEN** user clicks on the currently selected row
- **THEN** the selection SHALL remain unchanged

