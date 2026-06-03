## ADDED Requirements

### Requirement: 设计 token 扩展

系统 SHALL 在现有 tokens.css 基础上额外提供展示字体、等宽字体和更多阴影层级变量。

#### Scenario: 添加展示字体变量
- **WHEN** 系统加载
- **THEN** `--font-display` SHALL 存在

#### Scenario: 等宽字体变量兼容
- **WHEN** 系统加载
- **THEN** `--font-mono` SHALL 与 `--p-mono` 值保持一致
