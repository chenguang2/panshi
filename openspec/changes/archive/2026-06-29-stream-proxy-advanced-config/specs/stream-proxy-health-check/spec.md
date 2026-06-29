# stream-proxy-health-check Specification

## ADDED Requirements

### Requirement: Health check configurable via JSON

Stream proxy SHALL support health check configuration via a JSON textarea in advanced settings, following the same pattern as 7-layer upstream.

#### Scenario: Health check JSON editing
- **WHEN** user enables advanced config and edits the health check JSON textarea
- **THEN** the JSON SHALL be saved to the `checks` field of the stream proxy
- **THEN** the JSON SHALL be sent to the Edge node during publish
