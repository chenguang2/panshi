## ADDED Requirements

### Requirement: User can list upstreams for cluster
The system SHALL return all upstreams associated with the specified cluster.

#### Scenario: List cluster upstreams
- **WHEN** user calls GET /api/v1/clusters/{cluster_id}/upstreams
- **THEN** system returns paginated list of upstreams
- **AND** each upstream includes id, name, type, description, created_at

#### Scenario: Filter upstreams by keyword
- **WHEN** user calls GET /api/v1/clusters/{cluster_id}/upstreams?keyword=api
- **THEN** system returns only upstreams with name containing "api"

### Requirement: User can create upstream
The system SHALL allow users to create upstreams with target nodes and load balancing type.

#### Scenario: Create upstream with targets
- **WHEN** user calls POST /api/v1/clusters/{cluster_id}/upstreams with name, type, targets
- **THEN** system creates upstream and all target nodes
- **AND** returns HTTP 201 with upstream details including targets

#### Scenario: Create upstream with multiple targets
- **WHEN** user creates upstream with targets=[{host: "10.0.0.1", port: 8080, weight: 100}, {host: "10.0.0.2", port: 8080, weight: 100}]
- **THEN** both targets are created and associated with upstream

#### Scenario: Create upstream with invalid type
- **WHEN** user calls POST /api/v1/clusters/{cluster_id}/upstreams with type "invalid"
- **THEN** system returns HTTP 400 with validation error

### Requirement: User can update upstream
The system SHALL allow users to modify upstream configuration and target nodes.

#### Scenario: Update upstream targets
- **WHEN** user calls PUT /api/v1/clusters/{cluster_id}/upstreams/{id} with new targets
- **THEN** system replaces existing targets with new ones

#### Scenario: Update upstream type
- **WHEN** user calls PUT to change type from "roundrobin" to "chash"
- **THEN** upstream type is updated

### Requirement: User can delete upstream
The system SHALL allow deletion of upstreams that are not in use by routes.

#### Scenario: Delete unused upstream
- **WHEN** user calls DELETE /api/v1/clusters/{cluster_id}/upstreams/{id}
- **THEN** system deletes upstream and all associated targets

#### Scenario: Delete upstream in use by routes
- **WHEN** user calls DELETE for upstream referenced by routes
- **THEN** system returns HTTP 409 with error code "UPSTREAM_IN_USE"
- **AND** deletion is blocked

### Requirement: User can get upstream details
The system SHALL return full upstream details including all target nodes.

#### Scenario: Get upstream with targets
- **WHEN** user calls GET /api/v1/clusters/{cluster_id}/upstreams/{id}
- **THEN** response includes full upstream details and targets array
- **AND** includes route_count showing how many routes reference this upstream
