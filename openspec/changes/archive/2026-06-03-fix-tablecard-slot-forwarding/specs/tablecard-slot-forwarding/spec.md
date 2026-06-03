## ADDED Requirements

### Requirement: TableCard slots 转发
TableCard 组件 SHALL 将其接收到的所有 slots（除了 `header` 和 `footer`）转发给内部渲染的 `a-table` 组件。

#### Scenario: bodyCell slot 被渲染到 a-table
- **WHEN** 用户在 TableCard 上提供 `#bodyCell` slot
- **THEN** 该 slot 内容 SHALL 出现在实际渲染的表格体中
- **AND** 该 slot 接收的 `{ column, record }` 参数 SHALL 与直接使用 a-table 时一致

#### Scenario: header/footer slots 不被转发
- **WHEN** 用户提供 `#header` 或 `#footer` slot
- **THEN** 该 slot SHALL 被 TableCard 自身消费，不被传递到 a-table
- **AND** header slot 内容 SHALL 渲染在卡片顶部，footer 渲染在卡片底部
