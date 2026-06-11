## ADDED Requirements

### Requirement: Backend SHALL expose install-edge endpoint
The system SHALL provide a REST API endpoint to remotely install Edge service via ansible.

#### Scenario: Trigger Edge installation
- **WHEN** a POST request is made to `/clusters/{cluster_id}/nodes/{node_id}/install-edge`
- **WITH** body `{ "prefix": "/work/jboss/openresty-14" }`
- **THEN** the system SHALL execute the `install_edge` ansible tag against the target node
- **AND** the response SHALL be an SSE stream with real-time installation logs

#### Scenario: Edge installation success
- **WHEN** the ansible playbook completes with rc=0
- **THEN** the final SSE event SHALL indicate success with `status: "success"` and `rc: 0`

#### Scenario: Edge installation failure
- **WHEN** the ansible playbook fails or times out
- **THEN** the stream SHALL end with an error event containing `status: "failed"` and error details in `stderr`
