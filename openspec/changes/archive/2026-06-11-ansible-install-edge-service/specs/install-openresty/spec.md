## ADDED Requirements

### Requirement: Backend SHALL expose install-openresty endpoint
The system SHALL provide a REST API endpoint to remotely install OpenResty via ansible.

#### Scenario: Trigger OpenResty installation
- **WHEN** a POST request is made to `/clusters/{cluster_id}/nodes/{node_id}/install-openresty`
- **WITH** body `{ "prefix": "/data/openresty", "destpath": "/data/", "srcpath": "/path/to/soft" }`
- **THEN** the system SHALL execute the `install_openresty` ansible tag against the target node
- **AND** the response SHALL be an SSE stream with real-time installation logs

#### Scenario: Installation success
- **WHEN** the ansible playbook completes with rc=0
- **THEN** the final SSE event SHALL indicate success with `status: "success"` and `rc: 0`

#### Scenario: Installation failure
- **WHEN** the ansible playbook fails or times out
- **THEN** the stream SHALL end with an error event containing `status: "failed"` and error details in `stderr`
