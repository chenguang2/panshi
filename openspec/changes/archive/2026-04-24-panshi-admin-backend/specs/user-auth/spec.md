## ADDED Requirements

### Requirement: User can login with username and password
The system SHALL authenticate users using username and password credentials and return a JWT access token upon successful authentication.

#### Scenario: Successful login
- **WHEN** user submits valid username and password to POST /api/v1/auth/login
- **THEN** system returns HTTP 200 with JWT token, token_type "Bearer", and user info
- **AND** token expires according to configured JWT_EXPIRE_MINUTES

#### Scenario: Invalid credentials
- **WHEN** user submits invalid username or password to POST /api/v1/auth/login
- **THEN** system returns HTTP 401 with error code "INVALID_CREDENTIALS"
- **AND** no token is returned

#### Scenario: Inactive user login
- **WHEN** user with status "0" (inactive) attempts login
- **THEN** system returns HTTP 401 with error code "USER_INACTIVE"
- **AND** no token is returned

### Requirement: User can logout
The system SHALL invalidate the current JWT token upon logout request.

#### Scenario: Successful logout
- **WHEN** authenticated user calls POST /api/v1/auth/logout with valid JWT
- **THEN** system returns HTTP 200 with success message
- **AND** token is marked as invalidated

### Requirement: Authenticated user can get current user info
The system SHALL return the current authenticated user's information based on the JWT token.

#### Scenario: Get current user
- **WHEN** authenticated user calls GET /api/v1/auth/me with valid JWT
- **THEN** system returns HTTP 200 with user details (id, username, role, status, created_at)

#### Scenario: Invalid or missing token
- **WHEN** user calls GET /api/v1/auth/me without valid JWT
- **THEN** system returns HTTP 401 with error code "UNAUTHORIZED"

### Requirement: User can change own password
The system SHALL allow authenticated users to change their own password after verifying the old password.

#### Scenario: Successful password change
- **WHEN** authenticated user calls PUT /api/v1/auth/password with valid old_password and new_password
- **THEN** system updates password and returns HTTP 200 with success message
- **AND** new password is bcrypt hashed with cost factor 12

#### Scenario: Wrong old password
- **WHEN** authenticated user calls PUT /api/v1/auth/password with incorrect old_password
- **THEN** system returns HTTP 400 with error code "INVALID_OLD_PASSWORD"

#### Scenario: Weak new password
- **WHEN** authenticated user calls PUT /api/v1/auth/password with new_password shorter than 6 characters
- **THEN** system returns HTTP 400 with validation error
