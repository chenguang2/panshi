## ADDED Requirements

### Requirement: EdgeImport 步骤条样式统一
EdgeImport 的 a-steps 步骤条 SHALL 使用设计稿中的 wizard 样式覆盖。

#### Scenario: 步骤条样式
- **WHEN** 步骤条渲染
- **THEN** 步骤项 SHALL 显示为卡片式（圆角 + 背景 + 边框）
- **AND** 激活步骤 SHALL 使用品牌色边框和背景
- **AND** 已完成步骤 SHALL 使用成功色边框和背景
