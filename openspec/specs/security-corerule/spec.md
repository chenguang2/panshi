# security-corerule

## Purpose

基于 OWASP Core Rule Set 的安全检查引擎（WAF）插件，用于拦截恶意 HTTP 请求。

## Requirements

### Requirement: Plugin registration

The system SHALL register `security_corerule` in `BUILTIN_PLUGINS` with complete parameter schema.

#### Scenario: Plugin appears in API
- **WHEN** calling `GET /api/v1/plugins/builtin`
- **THEN** the response SHALL include `security_corerule` with non-empty schema

### Requirement: Route and metadata support

The plugin SHALL support both route-level config and metadata config (`enable_metadata: True`).

#### Scenario: enable_metadata is true
- **WHEN** the plugin schema is returned
- **THEN** `enable_metadata` SHALL be `true`

### Requirement: Frontend visibility

The plugin SHALL appear under the "安全防护" category in the frontend plugin selector.

#### Scenario: Category assigned
- **WHEN** viewing available plugins
- **THEN** `security_corerule` SHALL be listed under "安全防护"
