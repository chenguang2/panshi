## MODIFIED Requirements

### Requirement: Menu integration

The metrics monitoring feature SHALL use a parent-child menu structure in the sidebar.

The parent menu "指标监控" SHALL NOT be a clickable route itself — it SHALL serve as an expandable container for two sub-menus.

#### Scenario: Parent menu visible (feature enabled)
- **WHEN** the `metrics` feature switch is enabled in `features.yaml`
- **THEN** "指标监控" SHALL appear as an expandable parent item in the sidebar navigation menu
- **AND** clicking the parent SHALL toggle its sub-menu expansion (not navigate)

#### Scenario: Sub-menu "查询分析"
- **WHEN** the `metrics` feature is enabled
- **THEN** "查询分析" SHALL appear as a child item under "指标监控"
- **AND** clicking it SHALL navigate to `/metrics`

#### Scenario: Sub-menu "仪表盘"
- **WHEN** the `metrics` feature is enabled
- **THEN** "仪表盘" SHALL appear as a child item under "指标监控"
- **AND** clicking it SHALL navigate to `/metrics/dashboard`

#### Scenario: Feature disabled
- **WHEN** the `metrics` feature switch is disabled
- **THEN** both the parent menu and its sub-menus SHALL be hidden

## ADDED Requirements

### Requirement: Dashboard page layout

The dashboard SHALL provide a `/metrics/dashboard` route that displays a Grafana-style multi-chart overview page.

#### Scenario: Page loads with default metrics
- **WHEN** a user navigates to `/metrics/dashboard`
- **THEN** the page SHALL display a global control bar at the top (time range, refresh interval, auto-refresh toggle)
- **AND** SHALL display 3 business metric charts in a 2-column grid (first row: QPS + active connections, second row: error rate)
- **AND** SHALL display a collapsible "更多指标" section for infrastructure metrics

#### Scenario: Business metric definitions
- **WHEN** the dashboard loads
- **THEN** the QPS chart SHALL query `edge_http_requests_total` (Counter → rate, labeled "QPS" with unit `/s`)
- **AND** the active connections chart SHALL query `edge_nginx_http_current_connections?label=state:active` (Gauge, labeled "活跃连接数")
- **AND** the error rate chart SHALL query `edge_metric_errors` (Counter → rate, labeled "采集错误率")
- **AND** the latest value shown on each chart SHALL be the last data point from its time_series query result

#### Scenario: Infrastructure metrics in collapsible section
- **WHEN** the dashboard loads
- **THEN** the collapsible "更多指标" section SHALL contain charts for: `edge_shared_dict_capacity_bytes`, `edge_shared_dict_free_space_bytes`, `scrape_duration`, `scrape_samples_scraped`, `scrape_samples_post_metric_relabeling`, `scrape_series_added`, `up`

### Requirement: Global time range control

All charts on the dashboard SHALL share a single time range selector (1h, 6h, 24h, 7d).

#### Scenario: Time range change affects all charts
- **WHEN** a user changes the time range from 1h to 24h
- **THEN** ALL charts SHALL refresh with data spanning the last 24 hours
- **AND** the aggregation interval SHALL adjust: 1h→1m, 6h→5m, 24h→15m, 7d→1h

### Requirement: Auto-refresh

The dashboard SHALL support configurable auto-refresh with 3 options: 60s (default), 120s, 300s.

#### Scenario: Auto-refresh on
- **WHEN** the auto-refresh is enabled (default: on)
- **THEN** all chart data SHALL reload at the configured interval
- **AND** auto-refresh SHALL pause when the page is hidden

#### Scenario: Auto-refresh off
- **WHEN** the user disables auto-refresh via the toggle
- **THEN** charts SHALL NOT auto-refresh
- **AND** a manual "刷新" button SHALL be available

### Requirement: Concurrent data loading

The dashboard SHALL load all chart data concurrently using `Promise.allSettled` with no concurrency limitation. All requests SHALL be dispatched simultaneously.

#### Scenario: All requests succeed
- **WHEN** all metric queries return successfully
- **THEN** all charts SHALL render simultaneously with their data

#### Scenario: Some requests fail
- **WHEN** one or more metric queries fail
- **THEN** the failed charts SHALL show "数据加载失败"
- **AND** the successful charts SHALL render normally

### Requirement: Chart rendering

Each chart SHALL be a compact sparkline-style ECharts line chart.

#### Scenario: Chart with data
- **WHEN** data is available for a metric
- **THEN** the chart SHALL render a line chart with a smooth curve
- **AND** the chart SHALL display a current-value label (latest data point)
- **AND** hovering over the chart SHALL show a tooltip with exact values

#### Scenario: Chart without data
- **WHEN** no data is available for a metric
- **THEN** the chart SHALL display "当前无数据"

### Requirement: Collapsible section

Infrastructure metrics SHALL be grouped in a collapsible "更多指标" section below the main business charts.

#### Scenario: Section collapsed by default
- **WHEN** the dashboard loads
- **THEN** the "更多指标" section SHALL be collapsed
- **AND** SHALL show a clickable bar with a count of available infrastructure metrics

#### Scenario: Section expanded
- **WHEN** the user clicks "更多指标"
- **THEN** the section SHALL expand to show additional charts
- **AND** the label SHALL change to "收起"
