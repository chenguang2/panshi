## ADDED Requirements

### Requirement: Product name uses correct Chinese characters
The system SHALL use "磐石" (correct Chinese characters) instead of "盘石" throughout the interface.

#### Scenario: Login page displays correct product name
- **WHEN** user navigates to login page
- **THEN** page title displays "磐石网关管理平台" not "盘石网关管理平台"

#### Scenario: Dashboard displays correct product name
- **WHEN** user logs in and views dashboard
- **THEN** dashboard header displays "磐石" not "盘石"

### Requirement: Menu layout is horizontal at top
The system SHALL display the navigation menu horizontally at the top of the page, not vertically on the left side.

#### Scenario: Main navigation appears at top
- **WHEN** user is logged in
- **THEN** main menu items (集群管理, 用户管理, 字典管理) appear in a horizontal menu bar at the top

#### Scenario: Menu items are evenly spaced
- **WHEN** user views the top menu
- **THEN** menu items are displayed horizontally with even spacing

## MODIFIED Requirements

### Requirement: Layout structure changed from sidebar to top menu
The DefaultLayout component SHALL use a horizontal top menu layout instead of the previous left sidebar layout.

#### Scenario: Navigation moved to top
- **WHEN** user is authenticated
- **THEN** navigation menu appears at the top of the viewport
- **AND** no sidebar menu appears on the left side

#### Scenario: Responsive behavior
- **WHEN** screen width is less than 768px
- **THEN** menu collapses to hamburger menu