## ADDED Requirements

### Requirement: _publish_to_nodes helper function
A shared `_publish_to_nodes()` helper function SHALL be created in `backend/app/api/v1/common.py` that handles the node iteration, EdgeClient creation, encryption, logging, and success/failure tracking for publish operations.

#### Scenario: Publish endpoints use shared node loop
- **WHEN** any publish endpoint needs to sync to edge nodes
- **THEN** it SHALL call `_publish_to_nodes` with `active_nodes`, `edge_data`, a callable for the EdgeClient API method, and a callable for the logger
- **THEN** the function SHALL iterate nodes, create EdgeClient, encrypt data, invoke the API callable, invoke the logger callable, and track success/failure counts
- **THEN** the function SHALL return `(results, success_count, fail_count)`
