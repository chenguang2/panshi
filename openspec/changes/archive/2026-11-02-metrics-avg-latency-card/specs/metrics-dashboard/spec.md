# metrics-avg-latency-card — metrics-dashboard Delta

## MODIFIED Requirements

### Requirement: Dashboard page layout

The dashboard SHALL provide a `/metrics/dashboard` route that displays a multi-chart overview page organized into four labeled sections: 核心流量, 流量分析, 运行健康, and the collapsible 更多指标. Each section SHALL render a section header label. The 采集错误率 chart SHALL belong to the 运行健康 section (collection-pipeline health), not the business grid. The global control bar SHALL additionally contain a two-level cluster/node filter (集群 and 节点 selects). The 核心流量 section SHALL arrange: first row QPS + 平均耗时 (2-column), second row Nginx 连接状态 full width.

#### Scenario: Page loads with default metrics
- **WHEN** a user navigates to `/metrics/dashboard`
- **THEN** the page SHALL display a global control bar at the top (time range, refresh interval, auto-refresh toggle, manual refresh, cluster filter, node filter)
- **AND** the control bar SHALL display a last-updated timestamp (更新于 HH:mm:ss) on completion of each refresh cycle
- **AND** the page SHALL render the sections 核心流量, 流量分析, 运行健康, and the collapsible 更多指标, each with a section header label

#### Scenario: Section arrangement and grouping
- **WHEN** the dashboard renders
- **THEN** 核心流量 SHALL contain the QPS chart and the 平均耗时 chart in a 2-column first row, and the Nginx 连接状态 chart full width in the second row
- **AND** 流量分析 SHALL contain the 路由统计 table (full width) plus the HTTP 状态码分析 chart and the 时间对比 card in a 2-column grid
- **AND** 运行健康 SHALL contain the 节点健康 card and the 采集错误率 chart in a 2-column grid
- **AND** no section SHALL leave an empty grid cell

#### Scenario: Business metric definitions
- **WHEN** the dashboard loads
- **THEN** the QPS chart SHALL query `edge_http_requests_total` (Counter → rate, labeled "QPS" with unit `/s`, stored in `otel_metrics_gauge` with `Attributes['ip']`) in 核心流量
- **AND** the 平均耗时 chart SHALL query `edge_http_latency` (`latency_type=request`) from `otel_metrics_histogram` (labeled "平均耗时" with unit `ms`) in 核心流量
- **AND** the Nginx 连接状态 chart SHALL query `edge_nginx_http_current_connections` with 4 state series (active/reading/writing/waiting) in 核心流量, and its header value SHALL be labeled 活跃
- **AND** the 采集错误率 chart SHALL query `edge_metric_errors_total` (Counter → rate, unit `/s`) in 运行健康
- **AND** the analysis cards in 流量分析 SHALL display a scope annotation next to the card title (路由统计/HTTP 状态码分析: 近 {time range}; 时间对比: 今日 vs 昨日 / 本周 vs 上周; 节点健康: 实时快照)

#### Scenario: Infrastructure metrics in collapsible section
- **WHEN** the dashboard loads
- **THEN** the collapsible "更多指标" section SHALL contain charts for: `edge_shared_dict_capacity_bytes`, `edge_shared_dict_free_space_bytes`, `scrape_duration_seconds`, `scrape_samples_scraped`, `scrape_series_added`, `up`

## ADDED Requirements

### Requirement: Average request latency card

核心流量区的「平均耗时」卡 SHALL 展示全站请求平均处理耗时时间序列：数据源 `edge_http_latency`（`latency_type=request`）@ `otel_metrics_histogram`，算法为每桶窗口增量比值 `ΣΔSum / ΣΔCount`（ms），负增量（计数器重启）钳 0，随时间范围聚合间隔分桶。该卡 SHALL 接入既有的时间范围、刷新编排（手动/自动/单卡重试）、集群筛选与卡片三态机。

#### Scenario: 正常渲染
- **WHEN** 统计窗口内有请求增量
- **THEN** 卡片 SHALL 显示平均耗时 sparkline（ms）与头部最新值（单位 ms）
- **AND** 口径标注「近 {time range}」随卡标题展示

#### Scenario: 无增量桶
- **WHEN** 某桶无请求增量（ΔCount=0）但序列存在
- **THEN** 该桶值 SHALL 为 0.0 ms（事实语义：窗口内没有请求被处理），SHALL NOT 呈现空态文案

#### Scenario: 完全无数据
- **WHEN** 数据源无任何样本行
- **THEN** 卡片 SHALL 呈现空态「暂无上报数据」

#### Scenario: 集群筛选接入
- **WHEN** 用户选定集群/节点/未纳管筛选
- **THEN** 平均耗时卡 SHALL 仅反映筛选集合内节点的数据（filter 参数随请求透传）

#### Scenario: 增量口径
- **WHEN** 计算桶值
- **THEN** 算法 SHALL 为窗口增量比值 ΣΔSum/ΣΔCount（lagInFrame 差分，首桶增量为 0，负增量钳 0）
- **AND** 数值与路由统计-延迟视图（累计比值）不同属预期（语义不同：窗口平均 vs 自启动累计平均）
