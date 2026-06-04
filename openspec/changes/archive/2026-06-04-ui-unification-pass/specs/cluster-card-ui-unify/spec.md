## ADDED Requirements

### Requirement: 集群卡片网格视觉统一
ClusterList 中的集群卡片 SHALL 使用新设计体系的配色、字体和圆角。

#### Scenario: 卡片样式升级
- **WHEN** 集群卡片渲染
- **THEN** 卡片 SHALL 使用 `--p-bg-glass-table` 背景、`--p-glass-border` 边框、`--p-radius-lg` 圆角
- **AND** 卡片标题 SHALL 使用 `--font-mono` 字体显示集群名称
- **AND** 状态圆点 SHALL 使用 BadgeStatus 的圆点样式

#### Scenario: 交互保留
- **WHEN** 用户操作集群卡片
- **THEN** 分组折叠、展开 Tab、最大化视图等交互 SHALL 完全保留
