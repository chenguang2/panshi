## ADDED Requirements

### Requirement: User can list accessible clusters
The system SHALL return clusters accessible to the current user based on user-cluster assignments.

#### Scenario: User lists own clusters
- **WHEN** user calls GET /api/v1/clusters
- **THEN** system returns only clusters assigned to the user
- **AND** results include cluster id, name, admin_url, status, created_at

#### Scenario: Admin lists all clusters
- **WHEN** admin calls GET /api/v1/clusters
- **THEN** system returns all clusters regardless of assignment

### Requirement: Admin can create cluster
The system SHALL allow administrators to add new gateway clusters with Admin API connection details.

#### Scenario: Admin creates cluster
- **WHEN** admin calls POST /api/v1/clusters with name, admin_url, admin_key, description
- **THEN** system creates cluster and returns HTTP 201 with cluster details

#### Scenario: Admin creates cluster with duplicate name
- **WHEN** admin calls POST /api/v1/clusters with existing cluster name
- **THEN** system returns HTTP 409 with error code "CLUSTER_NAME_EXISTS"

### Requirement: Admin can update cluster
The system SHALL allow administrators to update cluster connection details and status.

#### Scenario: Admin updates cluster connection
- **WHEN** admin calls PUT /api/v1/clusters/{id} with new admin_url or admin_key
- **THEN** system updates cluster and returns HTTP 200

#### Scenario: Admin deactivates cluster
- **WHEN** admin calls PUT /api/v1/clusters/{id} with status "0"
- **THEN** cluster is marked inactive and sync operations are blocked

### Requirement: Admin can delete cluster
The system SHALL allow administrators to delete clusters and all associated resources.

#### Scenario: Admin deletes cluster with no resources
- **WHEN** admin calls DELETE /api/v1/clusters/{id}
- **THEN** system deletes cluster and returns HTTP 200

#### Scenario: Admin deletes cluster with upstreams
- **WHEN** admin calls DELETE /api/v1/clusters/{id} that has associated upstreams
- **THEN** system returns HTTP 409 with error code "CLUSTER_HAS_RESOURCES"
- **AND** deletion is blocked

### Requirement: User can test cluster connection
The system SHALL verify connectivity to the gateway cluster Admin API.

#### Scenario: Connection test succeeds
- **WHEN** user calls POST /api/v1/clusters/{id}/test
- **THEN** system attempts HTTP GET to cluster admin_url
- **AND** returns HTTP 200 with success=true and latency_ms

#### Scenario: Connection test fails
- **WHEN** cluster is unreachable or credentials are invalid
- **THEN** system returns HTTP 200 with success=false and error message

### Requirement: User can sync all config to cluster
The system SHALL synchronize all local configuration (upstreams and routes) to the target gateway cluster.

#### Scenario: Sync all config successfully
- **WHEN** user calls POST /api/v1/clusters/{id}/sync
- **THEN** system iterates through all upstreams and routes
- **AND** calls gateway Admin API to create/update each item
- **AND** returns summary with synced counts

#### Scenario: Sync with partial failures
- **WHEN** some items fail to sync
- **THEN** system returns HTTP 200 with failed items list
- **AND** each failed item includes type, id, and error message

### Requirement: Cluster has statistics
The system SHALL track and return resource counts for each cluster.

#### Scenario: Get cluster details with stats
- **WHEN** user calls GET /api/v1/clusters/{id}
- **THEN** response includes upstream_count and route_count
- **AND** includes last_sync_at timestamp
