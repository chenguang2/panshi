# redirect-plugin

## Purpose

APISIX redirect 插件支持，用于配置 HTTP 重定向行为。

## Requirements

### Requirement: Redirect plugin registration
The system SHALL register `redirect` as a builtin plugin in `BUILTIN_PLUGINS` with category `rewrite`, display name `重定向`, and `enable_metadata: False`.

#### Scenario: Plugin appears in plugin list
- **WHEN** user loads the plugin switches page
- **THEN** `redirect` plugin is listed with display name `重定向` and category `rewrite`

### Requirement: Redirect schema fields
The redirect plugin schema SHALL include the following fields: `http_to_https` (boolean), `uri` (string), `regex_uri` (array of 2 strings), `ret_code` (integer, default 302), `encode_uri` (boolean, default false), `append_query_string` (boolean, default false).

#### Scenario: Form mode renders all fields
- **WHEN** user opens the redirect plugin editor in form mode
- **THEN** all 6 fields are rendered with correct types, descriptions, examples, and hints

#### Scenario: JSON mode accepts valid config
- **WHEN** user switches to JSON mode and enters `{"uri": "/new-path", "ret_code": 301}`
- **THEN** the config is accepted without errors

### Requirement: Field mutual exclusion hints
The schema hints for `http_to_https`, `uri`, and `regex_uri` SHALL state that only one of the three may be configured. The hints for `http_to_https` SHALL state it cannot be used with `append_query_string`.

#### Scenario: User sees mutual exclusion hints
- **WHEN** user views the `http_to_https` field in form mode
- **THEN** the hints text states "与 uri 和 regex_uri 互斥，三选一；与 append_query_string 互斥"

### Requirement: Plugin switch validation
The `PluginSwitchItem` validator SHALL accept `redirect` as a valid plugin name.

#### Scenario: Enabling redirect plugin switch
- **WHEN** user enables the `redirect` plugin switch via PUT `/api/v1/plugin-switches`
- **THEN** the request succeeds and `redirect` is saved as enabled

### Requirement: Plugin config serialization
The redirect plugin config SHALL be serialized as JSON in the `plugins` JSON column of `PluginConfig` and `GlobalRule` tables, keyed by plugin name `redirect`.

#### Scenario: Route with redirect plugin
- **WHEN** a route's `plugins` JSON contains `{"redirect": {"http_to_https": true}}`
- **THEN** the config is stored and retrievable correctly via the plugin configs API
