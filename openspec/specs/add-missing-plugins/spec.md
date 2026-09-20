## Purpose

补齐插件清单：确保平台注册全部 13 个插件，插件详情接口返回非空 schema，前端插件下拉与列表完整可用。

## Requirements

### Requirement: 全部 13 个插件已注册

平台 SHALL 注册全部 13 个插件；内置插件详情接口 SHALL 为每个插件返回非空的 schema。

#### Scenario: 内置插件列表完整

- **WHEN** 调用 `GET /api/v1/plugins/builtin`
- **THEN** 响应 SHALL 包含全部 13 个插件
- **AND** 每个插件的 schema SHALL 非空
