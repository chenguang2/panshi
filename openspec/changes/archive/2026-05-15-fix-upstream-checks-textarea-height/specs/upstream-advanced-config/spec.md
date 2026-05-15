## MODIFIED Requirements

### Requirement: 高级配置包含健康检查

高级配置 Tab SHALL 包含可编辑的健康检查（checks）JSON 文本域。文本域高度 SHALL 匹配默认内容行数，避免过高空白。

#### Scenario: 健康检查文本域高度适配内容
- **WHEN** 用户打开上游弹窗并启用高级配置
- **THEN** 健康检查文本域高度 SHALL 为 6 行
- **AND** 能够完整展示默认 JSON 内容 `{"passive": {}, "active": {"unhealthy": {}}}`
