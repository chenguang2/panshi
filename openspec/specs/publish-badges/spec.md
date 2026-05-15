## ADDED Requirements

### Requirement: Node operations have more dropdown

The system SHALL provide a dropdown menu ("更多") in the node operations column to display action buttons not selected in the column settings.

#### Scenario: More menu shows unselected actions
- **WHEN** the user clicks "更多 ▼" 
- **THEN** a dropdown SHALL display all node actions not currently shown as buttons
- **THEN** clicking a menu item SHALL trigger the corresponding action

### Requirement: Upstream and route tables show publish status

The upstream and route tables SHALL display a "发布状态" column showing the current publish version and timestamp.

#### Scenario: Published item shows version and time
- **WHEN** an upstream or route has a `current_version` and `published_at`
- **THEN** the status column SHALL display a green badge with version and publish time

#### Scenario: Unpublished item shows pending status
- **WHEN** an upstream or route has no `current_version`
- **THEN** the status column SHALL display an orange "未发布" badge
