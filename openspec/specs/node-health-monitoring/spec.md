# Node Health Monitoring

## Purpose

Provides node health status monitoring and resource usage summary via ClickHouse metrics, enabling operators to quickly identify unhealthy nodes and shared dictionary capacity issues.

## Requirements

### Requirement: Node Health Status Monitoring
The system SHALL provide node health status monitoring using the `up` metric from the `otel_metrics_gauge` table.

#### Scenario: Query node health status
- **WHEN** a GET request is sent to `/api/v1/metrics/node-health`
- **THEN** the response SHALL contain a JSON array of node health statuses
- **AND** each entry SHALL include `node_ip`, `status` (1=healthy, 0=unhealthy), and `last_seen` fields
- **AND** results SHALL be sorted by status ASC (unhealthy first) and last_seen DESC

#### Scenario: Health status determination
- **WHEN** determining node health status
- **THEN** the system SHALL query the `up` metric from `otel_metrics_gauge`
- **AND** the status SHALL be the latest value (`argMax(Value, TimeUnix)`)
- **AND** nodes not seen in the last 5 minutes SHALL be considered stale

#### Scenario: Filter by health status
- **WHEN** a GET request is sent to `/api/v1/metrics/node-health` with `status=unhealthy`
- **THEN** the response SHALL only include nodes with status=0 (unhealthy)
- **AND** nodes with status=1 (healthy) SHALL be excluded

### Requirement: Resource Usage Summary
The system SHALL provide resource usage summary for shared dictionary capacity.

#### Scenario: Query resource usage
- **WHEN** a GET request is sent to `/api/v1/metrics/node-health` with `type=resource`
- **THEN** the response SHALL contain a JSON array of resource usage entries
- **AND** each entry SHALL include `dict_name`, `node_ip`, `capacity_bytes`, `free_bytes`, and `usage_percent` fields
- **AND** the data SHALL include both `edge_shared_dict_capacity_bytes` and `edge_shared_dict_free_space_bytes` metrics
- **AND** `usage_percent` SHALL be calculated as `(capacity_bytes - free_bytes) / capacity_bytes * 100`

### Requirement: Empty Data Response
The system SHALL return appropriate responses when no data is available.

#### Scenario: No data for query
- **WHEN** a GET request returns no data
- **THEN** the response SHALL return HTTP 200 with empty `data` array
- **AND** the response SHALL include `warning` field with message "No data available for the specified time range"

### Requirement: ClickHouse Connection Failure
The system SHALL gracefully handle ClickHouse connection failures.

#### Scenario: ClickHouse unavailable
- **WHEN** ClickHouse connection fails or times out
- **THEN** the response SHALL return HTTP 200 with empty `data` array
- **AND** the response SHALL include `error` field with failure reason
