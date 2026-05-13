## Decisions

- 模型对齐上游模式：使用 `ConfigVersion` 通用版本表
- 保留 `plugin_name` 为主标识（Edge API 也用 plugin_name）
- 新增 `metadata_schema` 区分 route 级别 schema 和 metadata 级别 schema
