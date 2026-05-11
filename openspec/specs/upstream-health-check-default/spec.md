# upstream-health-check-default Specification

## Purpose
Enable passive and active health monitoring for upstreams by providing default health check configuration when creating new upstreams. Health check configuration is always included in requests, with a minimal default that can be customized via the advanced configuration tab.

## Requirements

### Requirement: Upstream health check default configuration

The system SHALL provide default health check configuration for ALL upstreams, regardless of whether advanced configuration is enabled.

#### Scenario: Health check config always present
- **WHEN** user creates an upstream (with or without advanced configuration)
- **THEN** the upstream request SHALL always include a default `checks` object

#### Scenario: Default health check minimal config
- **WHEN** upstream is created with default health check
- **THEN** the `checks` object SHALL be `{"passive": {}, "active": {"unhealthy": {}}}`

#### Scenario: User can customize health check via advanced config
- **WHEN** user enables advanced configuration and edits the checks JSON
- **THEN** user SHALL be able to modify the health check configuration before submitting
- **AND** user SHALL be able to add detailed healthy/unhealthy parameters

### Requirement: Upstream timeout default configuration

The system SHALL provide default timeout configuration for ALL upstreams.

#### Scenario: Default timeout config
- **WHEN** upstream is created with default configuration
- **THEN** the `timeout` object SHALL be `{"connect": 6, "send": 6, "read": 6}`
