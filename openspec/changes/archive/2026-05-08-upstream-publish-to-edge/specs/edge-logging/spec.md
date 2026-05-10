# Spec: edge-logging

## ADDED Requirements

### Requirement: Edge operation logging

The system SHALL log all edge API operations to `logs/edge/upstream.log` file.

#### Scenario: Log successful edge operation
- **WHEN** an edge API call completes successfully
- **THEN** the system SHALL append a log entry containing timestamp, cluster info, upstream info, request details, response details, and status SUCCESS

#### Scenario: Log failed edge operation
- **WHEN** an edge API call fails
- **THEN** the system SHALL append a log entry containing timestamp, cluster info, upstream info, request details, error details, and status FAILED

### Requirement: Log entry format

Each log entry SHALL include the following fields:
- Timestamp (YYYY-MM-DD HH:MM:SS)
- Cluster ID and name
- Upstream ID and name
- HTTP method and path
- Request body (before encryption)
- Encrypted request body
- Response status code
- Response body (decrypted)
- Overall status (SUCCESS/FAILED)
- Error message (if any)

#### Scenario: Verify log format
- **WHEN** a log entry is written
- **THEN** it SHALL contain all required fields separated by delimiters for easy parsing