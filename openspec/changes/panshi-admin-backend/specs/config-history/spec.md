## ADDED Requirements

### Requirement: System records all configuration changes
The system SHALL create audit log entries for all create, update, delete, and publish operations.

#### Scenario: Audit log on create
- **WHEN** user creates a resource (cluster/upstream/route)
- **THEN** system creates audit log with action="CREATE"
- **AND** new_value contains full resource data as JSON

#### Scenario: Audit log on update
- **WHEN** user updates a resource
- **THEN** system creates audit log with action="UPDATE"
- **AND** old_value and new_value contain before/after JSON

#### Scenario: Audit log on delete
- **WHEN** user deletes a resource
- **THEN** system creates audit log with action="DELETE"
- **AND** old_value contains deleted resource data

#### Scenario: Audit log on publish
- **WHEN** user publishes a route
- **THEN** system creates audit log with action="PUBLISH"
- **AND** new_value contains published configuration

### Requirement: Audit logs capture user identity
The system SHALL record which user performed each action.

#### Scenario: Audit log includes user
- **WHEN** audit log is created
- **THEN** user_id field contains the acting user's ID
- **AND** username field contains the acting user's username

### Requirement: Audit logs are queryable by resource
The system SHALL allow filtering audit logs by resource type and ID.

#### Scenario: Query history by route
- **WHEN** user calls GET /api/v1/clusters/{cluster_id}/routes/{id}/history
- **THEN** system returns only audit logs for that route

### Requirement: Audit logs support pagination
The system SHALL return paginated audit log results.

#### Scenario: Paginated history
- **WHEN** user requests route history
- **THEN** results are paginated with page and page_size parameters
- **AND** response includes total, page, page_size fields

### Requirement: Rollback restores configuration from audit entry
The system SHALL use audit log entries as source of truth for rollback operations.

#### Scenario: Rollback creates new audit entry
- **WHEN** route is rolled back to previous version
- **THEN** a new audit log entry is created with action="ROLLBACK"
- **AND** it references the rollback target via audit_log_id
