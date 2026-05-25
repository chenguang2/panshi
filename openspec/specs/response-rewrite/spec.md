# response-rewrite

## Purpose

定义 Edge 网关 `response_rewrite` 插件的配置 schema，支持修改响应状态码、响应头、响应体以及正则替换，支持条件表达式和按 HTTP 方法重写。

## Requirements

### Requirement: status field

The plugin schema SHALL define a `status` field of type `integer` with no default value, supporting values `200` to `599`.

#### Scenario: status schema is defined
- **WHEN** the plugin schema is returned from the API
- **THEN** `schema.status` SHALL exist, `schema.status.type` SHALL be `"integer"`, and `schema.status.description` SHALL mention HTTP status code range

### Requirement: headers as simple Object

The plugin schema SHALL define `headers` as a simple Object type for overriding response headers, NOT as the nested set/add/remove structure.

#### Scenario: headers schema is simple Object
- **WHEN** the plugin schema is returned from the API
- **THEN** `schema.headers.type` SHALL be `"object"` and `schema.headers` SHALL NOT have nested `properties.set` or `properties.add`

### Requirement: add_headers as top-level field

The plugin schema SHALL define `add_headers` as a top-level Object field for appending response headers, independent from `headers`.

#### Scenario: add_headers is top-level
- **WHEN** the plugin schema is returned from the API
- **THEN** `schema.add_headers` SHALL exist at the same level as `schema.headers`, with `type` being `"object"`

### Requirement: regex_body with count parameter

The plugin schema SHALL define `regex_body` as an Array where each item is an Array of `[regex, replacement, count]` (count defaults to 0 meaning replace all).

#### Scenario: regex_body array structure
- **WHEN** the plugin schema is returned from the API
- **THEN** `schema.regex_body.type` SHALL be `"array"` and `schema.regex_body.description` SHALL mention the `[regex, replacement, count]` format

### Requirement: condition expression fields

The plugin schema SHALL include `include_add_headers_expr`, `include_headers_expr`, and `include_body_expr` as Array fields for conditional rewriting.

#### Scenario: condition expression fields exist
- **WHEN** the plugin schema is returned from the API
- **THEN** `schema.include_add_headers_expr` SHALL exist, `schema.include_headers_expr` SHALL exist, and `schema.include_body_expr` SHALL exist, all of type Array

### Requirement: HTTP method override support

The plugin schema SHALL document that HTTP method names (e.g., `"GET"`, `"POST"`) can be used as keys in the plugin config to specify method-specific rewrite rules.

#### Scenario: HTTP method override mentioned
- **WHEN** the plugin schema is returned from the API
- **THEN** `schema` SHALL include a field that documents HTTP method override behavior

### Requirement: plain_text field preserved

The plugin schema SHALL preserve the `plain_text` boolean field with default `false`.

#### Scenario: plain_text schema exists
- **WHEN** the plugin schema is returned from the API
- **THEN** `schema.plain_text.type` SHALL be `"boolean"` and `schema.plain_text.default` SHALL be `false`
