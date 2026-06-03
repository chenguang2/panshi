## ADDED Requirements

### Requirement: 废弃 class 清理
`frontend/src/style.css` 中不再使用的老旧 class SHALL 被移除。

#### Scenario: 移除废弃 class
- **WHEN** style.css 分析完成
- **THEN** `.card-stat-compact` 和 `.card-table` 样式 SHALL 被移除
- **AND** 其他正在使用的覆盖 SHALL 保留不动
