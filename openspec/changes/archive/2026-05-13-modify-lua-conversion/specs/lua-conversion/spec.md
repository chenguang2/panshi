## ADDED Requirements

### Requirement: Lua function serializes to config string without wrapping

The system SHALL serialize a complete Lua function definition into an escaped JSON string without adding any prefix or suffix wrapping.

#### Scenario: Encode full function without wrapping
- **WHEN** the input Lua code is a complete function definition: `function(conf, ctx)\n  ngx.log(ngx.ERR, "hello")\nend`
- **THEN** the output SHALL be the JSON-escaped string of the input without added `return function(conf, ctx)\n` or `\nend`

#### Scenario: Encode simple function
- **WHEN** the input Lua code is `function(conf) return "ok" end`
- **THEN** the output SHALL be exactly `"function(conf) return \"ok\" end"`

### Requirement: Config string deserializes to Lua function

The system SHALL deserialize a JSON-escaped string back to the original Lua function definition without stripping content.

#### Scenario: Decode plain config string
- **WHEN** the input config string is `"function(conf, ctx)\n  ngx.log(ngx.ERR, \"hello\")\nend"`
- **THEN** the output SHALL be `function(conf, ctx)\n  ngx.log(ngx.ERR, "hello")\nend`

#### Scenario: Decode invalid JSON returns error
- **WHEN** the input config string is not valid JSON
- **THEN** the output SHALL be `'解析失败：输入不是有效的 JSON 字符串'`

### Requirement: Config string deserialization backwards-compatible with legacy wrapping

The system SHALL detect and handle legacy-format config strings that include the old `return function(conf, ctx)\n` prefix and `\nend` suffix, stripping them to recover the inner function definition.

#### Scenario: Decode legacy wrapped config string
- **WHEN** the input config string is `"return function(conf, ctx)\n  ngx.log(ngx.ERR, \"hello\")\nend"`
- **THEN** the output SHALL be `ngx.log(ngx.ERR, "hello")` (function body without wrapping)

#### Scenario: Decode legacy string with complex body
- **WHEN** the input config string is a valid JSON string starting with `"return function(conf, ctx)` and ending with `end"`
- **THEN** the system SHALL strip the prefix and suffix, returning only the inner body
