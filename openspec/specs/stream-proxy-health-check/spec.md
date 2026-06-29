# stream-proxy-health-check Specification

## Purpose
四层代理支持健康检查配置，通过 JSON 编辑方式设定，与七层上游的健康检查能力一致。

## Requirements

### Requirement: Health check configurable via JSON

Stream proxy SHALL support health check configuration via a JSON textarea in advanced settings, following the same pattern as 7-layer upstream.

#### Scenario: Health check JSON editing
- **WHEN** user enables advanced config and edits the health check JSON textarea
- **THEN** the JSON SHALL be saved to the `checks` field of the stream proxy
- **THEN** the JSON SHALL be sent to the Edge node during publish
