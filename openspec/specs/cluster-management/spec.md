## ADDED Requirements

### Requirement: Route edit form has method select all

The route edit form SHALL provide a "全选" toggle button for the request methods multi-select.

#### Scenario: Select all methods
- **WHEN** the user clicks "全选"
- **THEN** all 7 HTTP methods (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS) SHALL be selected

#### Scenario: Deselect all methods
- **WHEN** the user clicks "取消全选"
- **THEN** all methods SHALL be deselected
