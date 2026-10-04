# stream-proxy-management Delta

## MODIFIED Requirements

### Requirement: User can edit a stream proxy
The system SHALL allow editing an existing stream proxy's configuration. Update payload field boundaries SHALL align with the create base schema: `name` SHALL be 1-100 characters and `listen_port` SHALL be 1-65535; out-of-range values MUST be rejected at validation time (4xx) and MUST NOT be persisted, so a rejected update can never leave a row that fails response validation.

#### Scenario: Edit proxy name and targets
- **WHEN** user clicks "编辑" and modifies the proxy name and upstream targets
- **THEN** the system updates the proxy record in the database

#### Scenario: Cannot edit listen port
- **WHEN** user edits a stream proxy
- **THEN** the listen port field is read-only (port change requires delete and recreate)

#### Scenario: Update with out-of-range values is rejected without dirty rows
- **WHEN** a PUT update carries `listen_port` outside 1-65535 or `name` outside 1-100 characters
- **THEN** the API SHALL reject the request with a validation error (4xx) before any database write
- **AND** the existing row SHALL remain unchanged and readable (no 500 on subsequent GET)
