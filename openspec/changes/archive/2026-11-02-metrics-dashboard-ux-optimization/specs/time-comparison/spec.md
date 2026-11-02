# metrics-dashboard-ux-optimization — time-comparison Delta

## ADDED Requirements

### Requirement: 周对比前端呈现

时间对比卡 SHALL 按对比类型映射载荷字段并切换标签：`day_over_day` 使用 `today_requests/yesterday_requests`（标签 今日请求/昨日请求，变化率后缀 较昨日）；`week_over_week` 使用 `this_week_requests/last_week_requests`（标签 本周请求/上周请求，变化率后缀 较上周）。两种类型 SHALL 同样支持渲染，周对比 SHALL NOT 因字段名不匹配而呈现空态。

#### Scenario: 周对比正常渲染
- **WHEN** 用户在时间对比卡选择「周对比」
- **THEN** 卡片 SHALL 显示 本周请求、上周请求（取自 `this_week_requests`/`last_week_requests`）
- **AND** 变化率标注「较上周」，数据质量与采样数取自周载荷字段

#### Scenario: 日对比标签与后缀
- **WHEN** 用户选择「日对比」
- **THEN** 卡片 SHALL 显示 今日请求、昨日请求，变化率标注「较昨日」

#### Scenario: 采样覆盖展示
- **WHEN** 日对比或周对比返回采样数字段（`today_sample_count`/`yesterday_sample_count` 或周对应字段）
- **THEN** 卡片 SHALL 在数据质量标签处以 tooltip 与弱色小字展示采样覆盖（如「今日已采样 501/1440 分钟。统计日未结束时会显示部分，属正常现象」）
- **AND** 数据质量标签文案为「采样完整 / 采样部分」
