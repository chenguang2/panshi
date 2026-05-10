## ADDED Requirements

### Requirement: Admin can list all users
The system SHALL allow administrators to list all users with pagination support.

#### Scenario: Admin lists users
- **WHEN** admin calls GET /api/v1/admin/users
- **THEN** system returns HTTP 200 with paginated user list
- **AND** results include id, username, role, status, created_at

#### Scenario: Admin filters users by keyword
- **WHEN** admin calls GET /api/v1/admin/users?keyword=john
- **THEN** system returns only users with username containing "john"

#### Scenario: Admin filters users by role
- **WHEN** admin calls GET /api/v1/admin/users?role=user
- **THEN** system returns only users with role "user"

### Requirement: Admin can create new user
The system SHALL allow administrators to create new users with specified role and initial password.

#### Scenario: Admin creates user successfully
- **WHEN** admin calls POST /api/v1/admin/users with username, password, role
- **THEN** system creates user and returns HTTP 201 with user details
- **AND** password is bcrypt hashed before storage

#### Scenario: Admin creates user with duplicate username
- **WHEN** admin calls POST /api/v1/admin/users with existing username
- **THEN** system returns HTTP 409 with error code "USERNAME_EXISTS"

#### Scenario: Non-admin cannot create user
- **WHEN** regular user calls POST /api/v1/admin/users
- **THEN** system returns HTTP 403 with error code "FORBIDDEN"

### Requirement: Admin can update user
The system SHALL allow administrators to update user role and status.

#### Scenario: Admin updates user role
- **WHEN** admin calls PUT /api/v1/admin/users/{id} with new role
- **THEN** system updates user role and returns HTTP 200

#### Scenario: Admin deactivates user
- **WHEN** admin calls PUT /api/v1/admin/users/{id} with status "0"
- **THEN** user cannot login until status is restored to "1"

### Requirement: Admin can delete user
The system SHALL allow administrators to delete users, but not themselves.

#### Scenario: Admin deletes user
- **WHEN** admin calls DELETE /api/v1/admin/users/{id}
- **THEN** system deletes user and returns HTTP 200

#### Scenario: Admin tries to delete self
- **WHEN** admin calls DELETE /api/v1/admin/users/{own_id}
- **THEN** system returns HTTP 400 with error code "CANNOT_DELETE_SELF"

### Requirement: Admin can reset user password
The system SHALL allow administrators to reset any user's password to a new specified value.

#### Scenario: Admin resets user password
- **WHEN** admin calls PUT /api/v1/admin/users/{id}/password with new_password
- **THEN** system updates password and returns HTTP 200

### Requirement: Admin can assign clusters to user
The system SHALL allow administrators to assign clusters to users, replacing existing assignments.

#### Scenario: Admin assigns clusters to user
- **WHEN** admin calls PUT /api/v1/admin/users/{id}/clusters with cluster_ids
- **THEN** system replaces user's cluster assignments
- **AND** user can only access assigned clusters

#### Scenario: User views own assigned clusters
- **WHEN** admin calls GET /api/v1/admin/users/{id}/clusters
- **THEN** system returns list of cluster IDs assigned to user
