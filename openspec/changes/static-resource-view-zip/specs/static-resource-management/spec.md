## MODIFIED Requirements

### Requirement: 静态资源管理页面

静态资源管理页面 SHALL 独立于集群上下文，提供全局视图。

#### Scenario: 卡片操作按钮
- **WHEN** 管理员点击操作按钮
- **THEN** SHALL 使用与集群管理相同的函数
- **AND** 卡片操作区新增"查看"按钮，位于"上传 ZIP"按钮之前
- **AND** 仅当静态资源已上传 ZIP（存在 `file_size`）时，"查看"按钮可点击
- **AND** 未上传 ZIP 时，"查看"按钮置灰（disabled），鼠标悬停时 title 提示"暂未上传 ZIP 文件"
