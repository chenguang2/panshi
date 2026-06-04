## NEW Requirements

### Requirement: User list table

The user list page SHALL display user data in a hand-written HTML table styled consistently with the route and upstream list pages.

#### Scenario: Table structure
- **WHEN** the page loads
- **THEN** a `<table>` element SHALL be used instead of an Ant Design `TableCard` component
- **THEN** the table SHALL have `<thead>` and `<tbody>` sections
- **THEN** table CSS SHALL match RouteList/UpstreamList: same header background, padding, font, row hover, border

#### Scenario: Filter bar
- **WHEN** the page loads
- **THEN** the filter controls SHALL use the global `.form-input` styles (no scoped overrides)
- **THEN** `flex-wrap: wrap` SHALL be used instead of `nowrap`
- **THEN** the `.search-input-wrap` scoped overrides SHALL be removed (use global definitions)

#### Scenario: Delete confirmation
- **WHEN** admin clicks "删除"
- **THEN** a `Modal.confirm` dialog SHALL appear instead of native `confirm()`

#### Scenario: New user modal
- **WHEN** admin clicks "+ 新建用户"
- **THEN** `selectedClusterIds` SHALL be reset to empty array
