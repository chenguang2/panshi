## ADDED Requirements

### Requirement: Global list APIs support group_name query filter
All global resource list API endpoints SHALL accept an optional `group_name` query parameter to filter resources by cluster group. When provided, the backend SHALL join the resource's cluster and filter by `Cluster.group_name`.

#### Scenario: group_name filters by exact match
- **WHEN** client calls `GET /routes?group_name=production`
- **THEN** the response SHALL only include routes whose cluster has `group_name = "production"`

#### Scenario: group_name=__ung__ filters ungrouped clusters
- **WHEN** client calls `GET /upstreams?group_name=__ung__`
- **THEN** the response SHALL only include upstreams whose cluster has `group_name IS NULL OR group_name = ""`

#### Scenario: group_name defaults to __all__
- **WHEN** client calls `GET /routes` without `group_name`
- **THEN** the backend SHALL treat it as `group_name=__all__`
- **AND** the response SHALL include routes from all clusters (original behavior unchanged)

#### Scenario: group_name works with other filters
- **WHEN** client calls `GET /routes?group_name=staging&search=api`
- **THEN** the response SHALL filter by both `group_name` and `search` simultaneously

#### Scenario: group_name works with pagination
- **WHEN** client calls `GET /routes?group_name=production&page=2&page_size=20`
- **THEN** the response SHALL return page 2 of production-group routes with correct total count

### Requirement: All 8 global list endpoints support group_name
The following endpoints SHALL all support the `group_name` query parameter with identical semantics:

- `GET /routes`
- `GET /upstreams`
- `GET /nodes`
- `GET /plugin_configs`
- `GET /global_rules`
- `GET /plugin_metadata`
- `GET /static_resources`
- `GET /stream-proxies`

#### Scenario: Each endpoint supports group_name
- **WHEN** client sends `group_name=production` to any of the 8 endpoints
- **THEN** the response SHALL be correctly filtered to resources in production-group clusters
