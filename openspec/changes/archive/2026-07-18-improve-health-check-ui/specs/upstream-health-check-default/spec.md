# upstream-health-check-default (Delta Specification)

## MODIFIED Requirements

### Requirement: Upstream health check default configuration

The system SHALL provide structured default health check configuration for upstreams, with mode-based defaults instead of a minimal JSON object.

#### Scenario: New upstream defaults to off

- **WHEN** user opens create upstream form
- **THEN** health check toggle SHALL default to OFF
- **AND** when user first enables the toggle, mode SHALL default to "仅主动检查" (active only)
- **AND** all active check fields SHALL be pre-filled with defaults:
  - type: "http"
  - http_path: "/"
  - timeout: 1
  - interval: 5
  - concurrency: 10
  - https_verify_certificate: true
  - healthy.successes: 2
  - healthy.http_statuses: [200, 302, 403, 404]
  - unhealthy.http_failures: 5
  - unhealthy.http_statuses: [429, 500, 501, 502, 503, 504, 505]
  - unhealthy.tcp_failures: 2
  - unhealthy.timeouts: 3
  - unhealthy.interval: 3

#### Scenario: Passive mode default values

- **WHEN** user selects a mode that includes passive health check
- **THEN** passive check fields SHALL be pre-filled with defaults:
  - type: "http"
  - healthy.successes: 5
  - healthy.http_statuses: [200, 201, ..., 308]
  - unhealthy.http_failures: 5
  - unhealthy.http_statuses: [429, 500, 503]
  - unhealthy.tcp_failures: 2
  - unhealthy.timeouts: 7

#### Scenario: User can customize health check via form or JSON

- **WHEN** health check toggle is ON
- **THEN** user SHALL be able to modify parameters via the structured form
- **AND** user SHALL be able to switch between active/passive/both modes
- **AND** user SHALL be able to edit raw JSON via the JSON editor button

## REMOVED Requirements

### Requirement: Upstream health check default configuration (original)

**Reason**: Default config approach has changed from a single minimal JSON to mode-based structured defaults

**Migration**: The old default `{"passive": {}, "active": {"unhealthy": {}}}` is replaced by the new "仅主动检查" mode with full default values.

### Requirement: Upstream timeout default configuration

**Reason**: Timeout defaults are not part of this change scope
