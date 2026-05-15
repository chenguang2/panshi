# advanced-toggle-reset Specification

## Purpose
TBD - created by archiving change fix-data-comparison-and-toggle-reset. Update Purpose after archive.
## Requirements
### Requirement: 上游高级配置开关关闭时重置字段

上游弹窗的"高级配置"开关关闭时，系统 SHALL 将所有高级字段重置为默认值。

#### Scenario: 关闭高级配置开关重置字段
- **WHEN** 用户开启"高级配置"开关并填写自定义值
- **AND** 用户再次关闭"高级配置"开关
- **THEN** checks 恢复为默认 JSON `{"passive": {}, "active": {"unhealthy": {}}}`
- **AND** retries 恢复为 undefined
- **AND** retry_timeout 恢复为 0
- **AND** timeout 恢复为 `{"connect": 6, "send": 6, "read": 6}`
- **AND** pass_host 恢复为 `"pass"`
- **AND** upstream_host 恢复为 `""`
- **AND** scheme 恢复为 `"http"`
- **AND** keepalive_pool 恢复为 `{"size": undefined, "idle_timeout": undefined, "requests": undefined}`

### Requirement: 路由高级匹配开关关闭时重置字段

路由弹窗的"高级匹配"开关关闭时，系统 SHALL 将 vars 重置为空数组。

#### Scenario: 关闭高级匹配开关重置 vars
- **WHEN** 用户开启"高级匹配"开关并添加匹配规则
- **AND** 用户再次关闭"高级匹配"开关
- **THEN** vars 恢复为空数组 `[]`

### Requirement: 再次开启时字段为空白状态

关闭后再开启开关时，字段 SHALL 处于空白/默认状态，而非保留之前的配置值。

#### Scenario: 上游高级配置开关再次开启
- **WHEN** 用户关闭"高级配置"开关
- **AND** 再次开启"高级配置"开关
- **THEN** 所有高级字段为默认值（如同新建时的状态）

#### Scenario: 路由高级匹配开关再次开启
- **WHEN** 用户关闭"高级匹配"开关
- **AND** 再次开启"高级匹配"开关
- **THEN** vars 为空数组 `[]`

