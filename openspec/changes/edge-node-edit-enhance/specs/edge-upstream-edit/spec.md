## ADDED Requirements

### Requirement: 上游编辑提交

用户 SHALL 能够在边缘节点管理界面上游 Tab 中编辑已有上游资源并提交保存。

#### Scenario: 编辑上游并提交
- **WHEN** 用户在上游表格中点击某条上游的编辑按钮
- **THEN** 弹出编辑 Modal，表单中回填该上游的现有数据（名称、类型、节点列表）
- **WHEN** 用户修改数据后点击确定
- **THEN** 前端调用 `PUT /edge-client/nodes/{ip}/{port}/upstreams/{id}` 提交更新
- **AND** 提交成功后刷新上游列表并显示成功提示

#### Scenario: 一致性哈希模式下显示 hash 字段
- **WHEN** 用户在上游表单中选择类型为 `chash`（一致性哈希）
- **THEN** 表单中显示"哈希位置"（hash_on）下拉框和"Key"输入框
- **AND** hash_on 可选值为 `header`、`cookie`、`vars`、`vars_combinations`
- **AND** 提交时 hash_on 和 key 随请求一起发送

#### Scenario: 非 chash 模式隐藏 hash 字段
- **WHEN** 用户选择非 chash 的类型
- **THEN** hash_on 和 Key 字段隐藏
- **AND** 提交时不发送 hash_on 和 key

#### Scenario: 上游编辑失败
- **WHEN** 编辑提交时后端返回错误
- **THEN** 前端显示错误提示，不关闭 Modal
