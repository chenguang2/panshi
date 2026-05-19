## ADDED Requirements

### Requirement: 上游编辑提交

用户 SHALL 能够在边缘节点管理界面上游 Tab 中编辑已有上游资源并提交保存。

#### Scenario: 编辑上游并提交
- **WHEN** 用户在上游表格中点击某条上游的编辑按钮
- **THEN** 弹出编辑 Modal，表单中回填该上游的现有数据（名称、类型、节点列表）
- **WHEN** 用户修改数据后点击确定
- **THEN** 前端调用 `PUT /edge-client/nodes/{ip}/{port}/upstreams/{id}` 提交更新
- **AND** 提交成功后刷新上游列表并显示成功提示

#### Scenario: 上游编辑失败
- **WHEN** 编辑提交时后端返回错误
- **THEN** 前端显示错误提示，不关闭 Modal
