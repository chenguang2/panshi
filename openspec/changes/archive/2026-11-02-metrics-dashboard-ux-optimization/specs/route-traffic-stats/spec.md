# metrics-dashboard-ux-optimization — route-traffic-stats Delta

## ADDED Requirements

### Requirement: Route stats card presentation

路由统计卡 SHALL 以人性化格式渲染列值，并为不可解释的占位与标识提供 tooltip。

#### Scenario: 列值格式化
- **WHEN** 带宽视图渲染 `bytes_per_sec`/`total_bytes`
- **THEN** 值 SHALL 经 `formatFileSize` 渲染，速率带 `/s` 后缀
- **WHEN** 错误率视图渲染 `error_rate`、延迟视图渲染平均/最大延迟
- **THEN** 值 SHALL 分别带 `%` 与 `ms` 后缀
- **AND** QPS 值 SHALL 保留不超过 3 位小数

#### Scenario: 路由ID 列收窄
- **WHEN** 渲染「路由ID」列
- **THEN** 列宽 SHALL 收窄并省略展示，悬停 tooltip 显示完整 ID

#### Scenario: 未纳管占位解释
- **WHEN** 某路由在平台侧解析不到名称（未纳管）
- **THEN** 路由名列 SHALL 显示「未纳管」并带 tooltip「该路由未在平台纳管，可能由 Edge 侧直接创建」

#### Scenario: 空态语境化
- **WHEN** 统计窗口内无路由记录
- **THEN** 卡片 SHALL 显示「统计窗口内暂无请求」
