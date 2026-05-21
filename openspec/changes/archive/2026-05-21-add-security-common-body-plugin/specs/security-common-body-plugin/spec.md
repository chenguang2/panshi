## ADDED Requirements

### Requirement: Plugin registration in BUILTIN_PLUGINS

The system SHALL register `security_common_body` in the `BUILTIN_PLUGINS` list at `backend/app/api/v1/plugins.py` with a complete parameter schema.

#### Scenario: Plugin appears in API response
- **WHEN** a user or frontend calls `GET /api/plugins/builtin`
- **THEN** the response SHALL include a plugin entry with `name: "security_common_body"` and a non-empty `schema` field

### Requirement: denylist parameter

The plugin SHALL accept a `denylist` parameter of type `array[string]` for body content blacklist matching.

#### Scenario: denylist schema is defined
- **WHEN** the plugin schema is returned from the API
- **THEN** `schema.denylist.type` SHALL be `"array"` and `schema.denylist.items.type` SHALL be `"string"`

### Requirement: maxsize parameter

The plugin SHALL accept a `maxsize` parameter of type `integer` with a default value of `4096`, defining the maximum body size in bytes for content matching.

#### Scenario: maxsize schema is defined
- **WHEN** the plugin schema is returned from the API
- **THEN** `schema.maxsize.type` SHALL be `"integer"` and `schema.maxsize.default` SHALL be `4096`

### Requirement: status parameter

The plugin SHALL accept a `status` parameter of type `integer` with a default value of `403`, defining the HTTP status code returned when a request is blocked.

#### Scenario: status schema is defined
- **WHEN** the plugin schema is returned from the API
- **THEN** `schema.status.type` SHALL be `"integer"` and `schema.status.default` SHALL be `403`

### Requirement: message parameter

The plugin SHALL accept a `message` parameter of type `string` for the response body when a request is blocked.

#### Scenario: message schema is defined
- **WHEN** the plugin schema is returned from the API
- **THEN** `schema.message.type` SHALL be `"string"`

### Requirement: bypass_hugebody parameter

The plugin SHALL accept a `bypass_hugebody` parameter of type `boolean` with a default value of `true`, controlling whether to bypass body checking when the request body exceeds `maxsize`.

#### Scenario: bypass_hugebody schema is defined
- **WHEN** the plugin schema is returned from the API
- **THEN** `schema.bypass_hugebody.type` SHALL be `"boolean"` and `schema.bypass_hugebody.default` SHALL be `true`

### Requirement: Frontend category visibility

The plugin SHALL be visible in the frontend plugin selector under a "安全防护" (security) category.

#### Scenario: Plugin appears in frontend selector
- **WHEN** a user opens the plugin selector in route or plugin group editing
- **THEN** the plugin `security_common_body` SHALL be displayed under the "安全防护" category

### Requirement: Frontend form editing

The plugin SHALL support dual-mode editing (form mode and JSON mode) in the plugin editor drawer, consistent with other built-in plugins.

#### Scenario: Form fields render correctly
- **WHEN** a user adds `security_common_body` to a route and opens the editor
- **THEN** the editor SHALL render form fields for `denylist` (textarea), `maxsize` (number input), `status` (number input), `message` (text input), and `bypass_hugebody` (switch)
