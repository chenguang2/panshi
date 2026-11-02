# metrics-dashboard-ux-optimization — metrics-dashboard Delta

## MODIFIED Requirements

### Requirement: Dashboard page layout

The dashboard SHALL provide a `/metrics/dashboard` route that displays a multi-chart overview page organized into four labeled sections: 核心流量, 流量分析, 运行健康, and the collapsible 更多指标. Each section SHALL render a section header label. The 采集错误率 chart SHALL belong to the 运行健康 section (collection-pipeline health), not the business grid.

#### Scenario: Page loads with default metrics
- **WHEN** a user navigates to `/metrics/dashboard`
- **THEN** the page SHALL display a global control bar at the top (time range, refresh interval, auto-refresh toggle, manual refresh)
- **AND** the control bar SHALL display a last-updated timestamp (更新于 HH:mm:ss) on completion of each refresh cycle
- **AND** the page SHALL render the sections 核心流量, 流量分析, 运行健康, and the collapsible 更多指标, each with a section header label

#### Scenario: Section arrangement and grouping
- **WHEN** the dashboard renders
- **THEN** 核心流量 SHALL contain the QPS chart and the Nginx 连接状态 chart in a 2-column grid
- **AND** 流量分析 SHALL contain the 路由统计 table (full width) plus the HTTP 状态码分析 chart and the 时间对比 card in a 2-column grid
- **AND** 运行健康 SHALL contain the 节点健康 card and the 采集错误率 chart in a 2-column grid
- **AND** no section SHALL leave an empty grid cell (business charts 3-in-2 and single-card half rows SHALL NOT occur)

#### Scenario: Business metric definitions
- **WHEN** the dashboard loads
- **THEN** the QPS chart SHALL query `edge_http_requests_total` (Counter → rate, labeled "QPS" with unit `/s`) in 核心流量
- **AND** the Nginx 连接状态 chart SHALL query `edge_nginx_http_current_connections` with 4 state series (active/reading/writing/waiting) in 核心流量, and its header value SHALL be labeled 活跃
- **AND** the 采集错误率 chart SHALL query `edge_metric_errors_total` (Counter → rate, unit `/s`) in 运行健康
- **AND** the analysis cards in 流量分析 SHALL display a scope annotation next to the card title (路由统计/HTTP 状态码分析: 近 {time range}; 时间对比: 今日 vs 昨日 / 本周 vs 上周; 节点健康: 实时快照)

#### Scenario: Infrastructure metrics in collapsible section
- **WHEN** the dashboard loads
- **THEN** the collapsible "更多指标" section SHALL contain charts for: `edge_shared_dict_capacity_bytes`, `edge_shared_dict_free_space_bytes`, `scrape_duration_seconds`, `scrape_samples_scraped`, `scrape_series_added`, `up`

### Requirement: Chart rendering

Each chart SHALL be a compact sparkline-style ECharts line chart with a unified card state machine: loading > error > empty > data.

#### Scenario: Chart with data
- **WHEN** data is available for a metric
- **THEN** the chart SHALL render a line chart with a smooth curve
- **AND** the chart SHALL display a current-value label (latest data point) with its unit
- **AND** hovering over the chart SHALL show a tooltip with exact values

#### Scenario: Chart loading state
- **WHEN** chart data is being fetched (initial load, time-range change, or per-card retry)
- **THEN** the card SHALL show a skeleton/loading placeholder
- **AND** the card SHALL NOT display "当前无数据" or any empty-state copy while loading

#### Scenario: Chart without data
- **WHEN** no data is available for a traffic metric (HTTP 状态码分析, 路由统计)
- **THEN** the chart SHALL display "统计窗口内暂无请求"
- **WHEN** no data is available for a report metric (QPS, Nginx 连接状态, infrastructure metrics, 节点健康, 采集错误率)
- **THEN** the chart SHALL display "暂无上报数据"

#### Scenario: Chart load failure
- **WHEN** a chart query fails while the metrics source is unavailable (`source_ok === false`)
- **THEN** the card SHALL display "数据源不可用，无法读取指标"
- **WHEN** a chart query fails for any other reason
- **THEN** the card SHALL display "加载失败" with a per-card 重试 action that re-issues only that card's request

### Requirement: Concurrent data loading

The dashboard SHALL load all chart data concurrently using `Promise.allSettled` with no concurrency limitation. All requests SHALL be dispatched simultaneously.

#### Scenario: All requests succeed
- **WHEN** all metric queries return successfully
- **THEN** all charts SHALL render simultaneously with their data

#### Scenario: Some requests fail
- **WHEN** one or more metric queries fail
- **THEN** the failed charts SHALL show the attributed error copy (数据源不可用，无法读取指标 / 加载失败 ＋ 重试) per the chart state machine
- **AND** the successful charts SHALL render normally

## ADDED Requirements

### Requirement: Dashboard refresh consistency

Manual refresh and auto-refresh SHALL cover ALL dashboard sections: business charts, the analysis cards (路由统计, HTTP 状态码分析, 时间对比), the 运行健康 cards (节点健康, 采集错误率), and the infrastructure section when expanded.

#### Scenario: Manual refresh covers all sections
- **WHEN** the user clicks the 刷新 button
- **THEN** business charts, analysis cards, and 运行健康 cards SHALL reload
- **AND** the infrastructure section SHALL reload if it is expanded

#### Scenario: Auto refresh covers all sections
- **WHEN** auto-refresh is enabled and the timer fires
- **THEN** business charts, analysis cards, and 运行健康 cards SHALL reload
- **AND** the infrastructure section SHALL reload if it is expanded
- **AND** auto-refresh SHALL pause when the page is hidden

#### Scenario: Collapsed infrastructure exempt
- **WHEN** the infrastructure section is collapsed
- **THEN** refresh cycles SHALL NOT issue infrastructure chart requests

#### Scenario: Freshness timestamp
- **WHEN** a refresh cycle completes
- **THEN** the control bar SHALL show 更新于 HH:mm:ss with the completion time

### Requirement: Metric value formatting

All metric values SHALL be rendered in human-readable form via `utils/format.ts`; raw byte counts, unitless percentages, and raw timestamp strings SHALL NOT be displayed.

#### Scenario: Byte values humanized
- **WHEN** a value is a byte count or byte rate (共享字典容量/剩余, route bandwidth, total bytes)
- **THEN** it SHALL be formatted with `formatFileSize` (e.g. 30.5 MB), byte rates suffixed with `/s`

#### Scenario: Percentages and units rendered
- **WHEN** a value is a percentage (错误率, 使用率) or a duration (延迟)
- **THEN** it SHALL render with its unit (% / ms)

#### Scenario: Connection header labeled
- **WHEN** the Nginx 连接状态 card shows its header value
- **THEN** the value SHALL be suffixed with the 活跃 label
