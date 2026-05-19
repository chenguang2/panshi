## ADDED Requirements

### Requirement: 路由编辑提交

用户 SHALL 能够在边缘节点管理界面路由 Tab 中编辑已有路由资源并提交保存。

#### Scenario: 编辑路由并提交
- **WHEN** 用户在路由表格中点击某条路由的编辑按钮
- **THEN** 弹出编辑 Modal，表单中回填该路由的现有数据（名称、URI、方法、域名、优先级、上游 ID、插件 JSON、关联插件组）
- **WHEN** 用户修改数据后点击确定
- **THEN** 前端调用 `PUT /edge-client/nodes/{ip}/{port}/routes/{id}` 提交更新
- **AND** 提交成功后刷新路由列表并显示成功提示

#### Scenario: 路由编辑失败
- **WHEN** 编辑提交时后端返回错误
- **THEN** 前端显示错误提示，不关闭 Modal
