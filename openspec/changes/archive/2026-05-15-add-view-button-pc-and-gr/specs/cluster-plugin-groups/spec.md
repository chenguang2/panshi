## ADDED Requirements

### Requirement: 插件组卡片提供查看详情功能

系统 SHALL 在插件组卡片操作栏提供"查看"按钮，点击后以只读抽屉展示插件组详情。

#### Scenario: 查看插件组详情
- **WHEN** 用户点击插件组卡片的"查看"按钮（EyeOutlined 图标）
- **THEN** 系统 SHALL 打开抽屉展示插件组信息
- **AND** 展示名称、描述、发布状态、版本号
- **AND** 展示该插件组包含的所有插件配置 JSON
