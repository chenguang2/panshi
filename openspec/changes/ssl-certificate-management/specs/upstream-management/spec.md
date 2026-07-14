# upstream-management

## MODIFIED Requirements

### Requirement: Upstream HTTPS scheme

The upstream scheme field SHALL support `https` in addition to `http` for upstream connections.

#### Scenario: Upstream scheme selection
- **WHEN** user edits an upstream
- **THEN** the scheme dropdown SHALL include `https` as an option
- **AND** selecting `https` SHALL enable additional SSL verification options (https_verify_certificate)
