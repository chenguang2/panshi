# Spec: upstream-sync

## ADDED Requirements

### Requirement: Get upstream from edge server

The system SHALL allow retrieving a single upstream configuration from edge server by upstream ID.

#### Scenario: Get upstream by ID
- **WHEN** user requests to get an upstream configuration from edge server
- **THEN** the system SHALL send GET request to `/edge/admin/upstreams/{id}`
- **AND** return the decrypted response containing upstream details

### Requirement: List all upstreams from edge server

The system SHALL allow listing all upstream configurations from edge server.

#### Scenario: List all upstreams
- **WHEN** user requests to list all upstream configurations from edge server
- **THEN** the system SHALL send GET request to `/edge/admin/upstreams`
- **AND** return the decrypted response containing list of upstreams

### Requirement: Create upstream on edge server

The system SHALL allow creating a new upstream configuration on edge server.

#### Scenario: Create upstream
- **WHEN** user requests to create an upstream configuration on edge server
- **THEN** the system SHALL send POST request to `/edge/admin/upstreams`
- **AND** the request body SHALL be encrypted with SM4+Base64
- **AND** return the decrypted response containing created upstream details

### Requirement: Update upstream on edge server

The system SHALL allow updating an existing upstream configuration on edge server.

#### Scenario: Update upstream by ID
- **WHEN** user requests to update an upstream configuration on edge server
- **THEN** the system SHALL send PUT request to `/edge/admin/upstreams/{id}`
- **AND** the request body SHALL be encrypted with SM4+Base64
- **AND** return the decrypted response containing updated upstream details

### Requirement: Delete upstream from edge server

The system SHALL allow deleting an upstream configuration from edge server.

#### Scenario: Delete upstream by ID
- **WHEN** user requests to delete an upstream configuration from edge server
- **THEN** the system SHALL send DELETE request to `/edge/admin/upstreams/{id}`
- **AND** return the decrypted response confirming deletion

### Requirement: Patch upstream on edge server

The system SHALL allow partially updating an upstream configuration on edge server.

#### Scenario: Patch upstream by ID
- **WHEN** user requests to patch an upstream configuration on edge server
- **THEN** the system SHALL send PATCH request to `/edge/admin/upstreams/{id}`
- **AND** the request body SHALL be encrypted with SM4+Base64
- **AND** return the decrypted response containing patched upstream details