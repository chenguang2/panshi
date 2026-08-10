# Route Management

## ADDED Requirements

### Requirement: WebSocket 开关保存后回填一致

路由编辑表单 SHALL 在保存后再次编辑时正确回填「启用 WebSocket」勾选状态，与数据库一致。

#### Scenario: 勾选保存后回填选中
- **WHEN** 用户勾选「启用 WebSocket」并保存路由
- **THEN** API 响应与列表数据 SHALL 返回 `enable_websocket: true`
- **THEN** 再次编辑该路由时 checkbox SHALL 为选中状态

#### Scenario: 取消勾选后清除 DB 值
- **WHEN** 用户取消勾选「启用 WebSocket」并保存
- **THEN** 保存请求 SHALL 携带 `enable_websocket: false`（非缺席）
- **THEN** 数据库该字段 SHALL 更新为 false
- **THEN** 再次编辑时 checkbox SHALL 为未选中状态

#### Scenario: 两处表单入口一致
- **WHEN** 用户在独立路由管理页或统一管理页编辑路由
- **THEN** 两处入口 SHALL 均正确回填与保存 WebSocket 状态

### Requirement: 高级匹配行内提示动态化

高级匹配的行内提示 SHALL 随当前条件的变量名与值实时更新，不使用固定示例。

#### Scenario: 单值条件提示
- **WHEN** 条件为 header 类型、key=Host、operator=等于、value=example.com
- **THEN** 行内提示 SHALL 显示「等于匹配：http_host == example.com」（变量名与值均为实际条件）

#### Scenario: 数组条件提示
- **WHEN** 条件为 builtin、key=req_uri、operator=rx~、value=['/a','/b']
- **THEN** 行内提示 SHALL 显示「路径匹配优化版 in：req_uri rx~ [/a, /b]」（数组值格式化显示）
