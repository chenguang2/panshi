## MODIFIED Requirements

### Requirement: Group filter is client-side only
The system SHALL implement group filtering entirely on the frontend, without backend API changes.

→ **Updated to**: The system SHALL implement group filtering by passing the selected `group_name` as a backend API query parameter. The frontend SHALL include `group_name` in API requests when a specific group is selected. The backend SHALL perform server-side filtering via Cluster JOIN.

#### Scenario: Group filter triggers API request with group_name
- **WHEN** user selects a specific group from the group filter
- **THEN** the list page SHALL send an API request with `group_name=<selected_group>` parameter
- **AND** the response SHALL return only resources belonging to that group
- **AND** pagination SHALL behave normally (server-side, not client-side)

#### Scenario: Selecting "__all__" sends explicit all-groups value
- **WHEN** user selects "全部分组"
- **THEN** the API request SHALL include `group_name=__all__`
- **AND** the backend SHALL return resources from all clusters (no group filtering)

#### Scenario: Selecting "__ung__" sends special value
- **WHEN** user selects "未分组"
- **THEN** the API request SHALL include `group_name=__ung__`
- **AND** the backend SHALL interpret this as filtering for clusters with `group_name IS NULL OR group_name = ""`

#### Scenario: No groups exist
- **WHEN** no clusters have a `group_name` set
- **THEN** the group filter dropdown SHALL show only "全部分组" and "未分组"
- **AND** selecting "全部分组" SHALL omit `group_name` from the API call
