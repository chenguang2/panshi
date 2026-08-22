## ADDED Requirements

### Requirement: HTTP Status Code Classification
The system SHALL provide HTTP status code classification statistics using the `edge_http_status` metric from the `otel_metrics_sum` table.

#### Scenario: Query status code distribution
- **WHEN** a GET request is sent to `/api/v1/metrics/status-analysis` with `since=24h`
- **THEN** the response SHALL contain a JSON array of status code classifications
- **AND** each entry SHALL include `status_class`, `request_count`, and `percentage` fields
- **AND** the results SHALL be sorted by request_count descending

#### Scenario: Status code classification logic
- **WHEN** status codes are classified
- **THEN** codes starting with '2' SHALL be grouped as '2xx'
- **AND** codes starting with '3' SHALL be grouped as '3xx'
- **AND** codes starting with '4' SHALL be grouped as '4xx'
- **AND** codes starting with '5' SHALL be grouped as '5xx'
- **AND** non-standard codes SHALL be grouped as '其他'

#### Scenario: Percentage calculation
- **WHEN** percentage is calculated for each status class
- **THEN** the percentage SHALL be calculated as `(request_count / total_requests) * 100`
- **AND** the result SHALL be rounded to 2 decimal places
- **AND** division by zero SHALL be prevented by filtering out zero total requests

### Requirement: Detailed Status Code Breakdown
The system SHALL provide detailed status code breakdown within each classification.

#### Scenario: Query detailed status codes
- **WHEN** a GET request is sent to `/api/v1/metrics/status-analysis` with `detailed=true`
- **THEN** the response SHALL include individual status codes within each classification
- **AND** each status code SHALL have its own `request_count` and `percentage` fields

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
