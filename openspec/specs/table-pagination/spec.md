# table-pagination Specification

## Purpose
TBD - created by archiving change paging-and-query. Update Purpose after archive.
## Requirements
### Requirement: Pagination page size options
The system SHALL allow users to select the number of items displayed per page from options: 10, 20, 50, 100.

#### Scenario: User selects page size 10
- **WHEN** user selects page size "10"
- **THEN** the table SHALL display 10 items per page

#### Scenario: User selects page size 50
- **WHEN** user selects page size "50"
- **THEN** the table SHALL display 50 items per page

#### Scenario: User selects page size 100
- **WHEN** user selects page size "100"
- **THEN** the table SHALL display 100 items per page

### Requirement: Default page size
The system SHALL use 20 items per page as the default page size.

#### Scenario: Default page size on first load
- **WHEN** user opens the table for the first time
- **THEN** the table SHALL display 20 items per page

### Requirement: Pagination metadata in API response
The system SHALL return pagination metadata including: total count, current page, page size.

#### Scenario: API returns pagination metadata
- **WHEN** client requests route list
- **THEN** API SHALL return `{ "total": 100, "page": 1, "page_size": 20, "items": [...] }`

### Requirement: Page navigation
The system SHALL allow users to navigate between pages using Previous/Next buttons and direct page number input.

#### Scenario: User clicks Next page
- **WHEN** user clicks "Next" button when not on last page
- **THEN** the table SHALL display the next page of items

#### Scenario: User clicks Previous page
- **WHEN** user clicks "Previous" button when not on first page
- **THEN** the table SHALL display the previous page of items

#### Scenario: User jumps to last page
- **WHEN** user clicks "Last" button
- **THEN** the table SHALL display the last page of items

