# permission-persistence

## Purpose

确保用户权限在页面刷新（F5）后仍然可用，无需额外 API 调用。

## Requirements

### Requirement: User permissions persist across page refresh

The system SHALL persist the `permissions` array to `localStorage` so that after a full page refresh (F5), the user's permissions are immediately available without an additional API call.

#### Scenario: Login saves permissions to localStorage
- **WHEN** a user logs in successfully
- **THEN** the `permissions` array SHALL be saved to `localStorage` under the key `"permissions"`

#### Scenario: Logout removes permissions from localStorage
- **WHEN** a user logs out
- **THEN** the `"permissions"` key SHALL be removed from `localStorage`

#### Scenario: Store initialization restores permissions from localStorage
- **WHEN** the auth store is created (e.g., after F5 refresh)
- **THEN** it SHALL read `"permissions"` from `localStorage` and restore the `permissions` state

#### Scenario: No stored data defaults to empty
- **WHEN** there is no `"permissions"` key in `localStorage`
- **THEN** the `permissions` state SHALL default to `[]`

### Requirement: Edge nodes page guarded by permission

The system SHALL restrict access to the Edge Client page to users with the `edge_nodes` permission.

#### Scenario: Menu hidden without permission
- **WHEN** a user without `edge_nodes` permission views the navigation menu
- **THEN** the "边缘节点" menu item SHALL NOT be visible

#### Scenario: Route redirects without permission
- **WHEN** a user without `edge_nodes` permission navigates to `/edge-client`
- **THEN** the user SHALL be redirected to the home page `/`
