## ADDED Requirements

### Requirement: User can list routes for cluster
The system SHALL return all routes associated with the specified cluster.

#### Scenario: List cluster routes
- **WHEN** user calls GET /api/v1/clusters/{cluster_id}/routes
- **THEN** system returns paginated list of routes
- **AND** each route includes id, name, uri, methods, upstream_id, priority, status

#### Scenario: Filter routes by upstream
- **WHEN** user calls GET /api/v1/clusters/{cluster_id}/routes?upstream_id=5
- **THEN** system returns only routes bound to upstream 5

### Requirement: User can create route
The system SHALL allow users to create routes with URI pattern, HTTP methods, and upstream binding.

#### Scenario: Create route with all fields
- **WHEN** user calls POST /api/v1/clusters/{cluster_id}/routes with name, uri, methods, upstream_id, priority
- **THEN** system creates route with version=1
- **AND** returns HTTP 201 with route details

#### Scenario: Create route with minimal fields
- **WHEN** user calls POST with only name, uri, upstream_id
- **THEN** system creates route with default methods=[], priority=0, status="1"

#### Scenario: Create route with invalid upstream
- **WHEN** user calls POST with non-existent upstream_id
- **THEN** system returns HTTP 400 with error code "UPSTREAM_NOT_FOUND"

### Requirement: User can update route
The system SHALL allow users to modify route configuration.

#### Scenario: Update route URI
- **WHEN** user calls PUT to change route uri
- **THEN** system increments version number
- **AND** creates audit log entry with old and new values

#### Scenario: Update route binding to different upstream
- **WHEN** user rebinds route to different upstream
- **THEN** system updates upstream_id and increments version

### Requirement: User can delete route
The system SHALL allow deletion of routes.

#### Scenario: Delete route
- **WHEN** user calls DELETE /api/v1/clusters/{cluster_id}/routes/{id}
- **THEN** system deletes route and associated plugins
- **AND** returns HTTP 200

### Requirement: User can publish single route
The system SHALL synchronize a single route configuration to the gateway cluster.

#### Scenario: Publish route successfully
- **WHEN** user calls POST /api/v1/clusters/{cluster_id}/routes/{id}/publish
- **THEN** system converts route to gateway Admin API format
- **AND** calls gateway to create/update route
- **AND** returns HTTP 200 with published_at timestamp

#### Scenario: Publish route with gateway error
- **WHEN** gateway returns error during publish
- **THEN** system returns HTTP 502 with error from gateway
- **AND** no local state is modified

### Requirement: User can publish all routes
The system SHALL synchronize all routes of a cluster to the gateway.

#### Scenario: Publish all routes
- **WHEN** user calls POST /api/v1/clusters/{cluster_id}/routes/publish
- **THEN** system publishes all routes sequentially
- **AND** returns summary with total, published, and failed counts

### Requirement: User can view route version history
The system SHALL provide audit trail of all changes to a route.

#### Scenario: Get route history
- **WHEN** user calls GET /api/v1/clusters/{cluster_id}/routes/{id}/history
- **THEN** system returns paginated list of audit logs
- **AND** each entry includes action, user, timestamp, old_value, new_value

### Requirement: User can rollback route to previous version
The system SHALL restore route configuration from a historical audit entry.

#### Scenario: Rollback route
- **WHEN** user calls POST /api/v1/clusters/{cluster_id}/routes/{id}/rollback with audit_log_id
- **THEN** system restores route to that historical version
- **AND** increments version number
- **AND** creates new audit log entry with action "ROLLBACK"

#### Scenario: Rollback to invalid audit entry
- **WHEN** user provides audit_log_id that doesn't belong to this route
- **THEN** system returns HTTP 400 with error code "INVALID_ROLLBACK_TARGET"
