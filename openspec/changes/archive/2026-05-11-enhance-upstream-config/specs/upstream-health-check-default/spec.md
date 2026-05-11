## MODIFIED Requirements

### Requirement: Upstream health check default configuration
The system SHALL provide default health check configuration when creating a new upstream, visible in the advanced configuration tab.

#### Scenario: Health check config present when creating upstream
- **WHEN** user clicks "添加上游" button in upstream tab AND enables advanced configuration
- **THEN** the upstream form SHALL display a default `checks` object in the advanced configuration tab with passive and active health check configuration

#### Scenario: Default passive health check
- **WHEN** upstream is created with default health check
- **THEN** the `checks.passive` object SHALL be `{"type": "http"}`

#### Scenario: Default active health check
- **WHEN** upstream is created with default health check
- **THEN** the `checks.active` object SHALL include:
  - `type`: "http"
  - `unhealthy`: configuration with timeouts, tcp_failures, interval, http_statuses, http_failures
  - `healthy`: configuration with http_statuses, successes, interval
  - `https_verify_certificate`: true
  - `http_path`: "/"
  - `concurrency`: 10
  - `timeout`: 1

Default health check JSON structure:
```json
{
  "checks": {
    "passive": {
      "type": "http"
    },
    "active": {
      "type": "http",
      "unhealthy": {
        "timeouts": 3,
        "tcp_failures": 2,
        "interval": 1,
        "http_statuses": [429, 500, 501, 502, 503, 504, 505],
        "http_failures": 5
      },
      "https_verify_certificate": true,
      "http_path": "/",
      "concurrency": 10,
      "healthy": {
        "http_statuses": [200, 302, 403, 404],
        "successes": 2,
        "interval": 0
      },
      "timeout": 1
    }
  }
}
```

#### Scenario: User can modify or remove health check
- **WHEN** user creates an upstream with default health check
- **THEN** user SHALL be able to modify the health check JSON in the advanced config tab before submitting
- **AND** user SHALL be able to remove the health check configuration if not needed
