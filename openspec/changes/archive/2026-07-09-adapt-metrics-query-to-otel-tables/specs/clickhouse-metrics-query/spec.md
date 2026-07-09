# clickhouse-metrics-query

## MODIFIED Requirements

### Requirement: List all metric names

The API SHALL provide an endpoint `GET /api/v1/metrics/names` that returns all distinct `MetricName` values from both `otel_metrics_gauge` and `otel_metrics_sum` (UNION).

#### Scenario: Get metric names
- **WHEN** a GET request is sent to `/api/v1/metrics/names`
- **THEN** the response SHALL contain a JSON array of metric names (strings)
- **AND** each name SHALL be a unique MetricName from the combined set of otel_metrics_gauge and otel_metrics_sum

### Requirement: Query time-series data

The API SHALL provide an endpoint `GET /api/v1/metrics/{metric_name}` for querying time-series data with the following query parameters:

| Parameter | Type | Default | Description |
|---|---|---|---|
| `since` | string | `1h` | Time range: `1h`, `6h`, `24h`, `7d`, or ISO datetime |
| `interval` | string | `5m` | Aggregation interval: `1m`, `5m`, `15m`, `1h` |
| `label` | string | (optional) | Label filter in `key:value` format, e.g. `state:active`. Uses `Attributes['key'] = 'value'` for precise matching (Map syntax). |

The response SHALL contain an array of buckets with `timestamp`, `avg`, `max`, `min`, `sample_count` fields.

The data source SHALL be `otel_metrics_gauge` for Gauge metrics. Sum/Counter metrics SHALL use `otel_metrics_sum`.

#### Scenario: Query with default parameters
- **WHEN** a GET request is sent to `/api/v1/metrics/edge_http_requests_total`
- **THEN** the response SHALL contain time buckets at 5-minute intervals for the last 1 hour
- **AND** counter metrics SHALL return rate values (not raw cumulative values)

#### Scenario: Query with time range
- **WHEN** a GET request is sent to `/api/v1/metrics/edge_nginx_http_current_connections?since=6h&interval=15m`
- **THEN** the response SHALL contain time buckets at 15-minute intervals for the last 6 hours

#### Scenario: Query with label filter
- **WHEN** a GET request is sent to `/api/v1/metrics/edge_nginx_http_current_connections?label=state:active`
- **THEN** the response SHALL only include data points where the `state` label equals `active`
- **AND** the filter SHALL use the `Attributes` Map syntax: `Attributes['state'] = 'active'`

#### Scenario: Counter auto-detection
- **WHEN** a query is executed
- **THEN** the backend SHALL determine if the metric is a Counter by checking `otel_metrics_sum` for `IsMonotonic = 1 AND AggregationTemporality = 2`
- **AND** SHALL fall back to Prometheus convention (metric name ends with `_total`) for Counter detection in `otel_metrics_gauge`
- **AND** SHALL calculate rate for Counter metrics: `rate = (max(Value) - min(Value)) / time_delta_seconds`
- **AND** SHALL return raw values for Gauge metrics

#### Scenario: Counter rate calculation
- **WHEN** querying `edge_http_requests_total` (a Counter-type metric stored in the gauge table)
- **THEN** the response SHALL contain rate values (not raw cumulative values)
- **AND** negative rate values SHALL be clamped to 0

#### Scenario: Counter single sample point
- **WHEN** querying a Counter metric and a bucket contains only one data point
- **THEN** the rate value for that bucket SHALL be 0
- **AND** the `sample_count` field SHALL be 1

### Requirement: Metrics summary endpoint

The API SHALL provide an endpoint `GET /api/v1/metrics/summary` that returns the latest value for each metric.

The summary SHALL aggregate by MetricName only (not by label combination), returning the latest sampled value per metric, querying both `otel_metrics_gauge` and `otel_metrics_sum` via UNION ALL.

#### Scenario: Get latest values (aggregated by metric)
- **WHEN** a GET request is sent to `/api/v1/metrics/summary`
- **THEN** the response SHALL contain an object mapping each metric_name to its most recent sampled value
- **AND** metrics with multiple label dimensions (e.g. `edge_nginx_http_current_connections` with states) SHALL be aggregated into one entry per metric_name

### Requirement: Frontend metrics monitoring page

The frontend SHALL provide a metrics monitoring page at `/metrics` route.

The page SHALL be controlled by the `metrics` feature switch. When disabled, the menu entry SHALL NOT appear.

The summary cards SHALL only display business metrics:
- `edge_http_requests_total` — total requests
- `edge_nginx_http_current_connections` — active connections (latest value across all states)
- `edge_metric_errors_total` — metric scrape errors

Infrastructure metrics (`scrape_*`, `up`, `edge_shared_dict_*`) SHALL NOT appear in summary cards.

#### Scenario: Feature switch disabled
- **WHEN** the `metrics` feature switch is disabled in `features.yaml`
- **THEN** the "指标监控" menu entry SHALL NOT appear in the sidebar

#### Scenario: Page loads with chart
- **WHEN** a user navigates to `/metrics`
- **THEN** the page SHALL display a metric name selector (dropdown)
- **AND** SHALL display a time range selector (1h, 6h, 24h, 7d)
- **AND** SHALL display an ECharts line chart showing the selected metric over time
- **AND** SHALL display summary cards showing the latest values of business metrics

#### Scenario: Metric selection changes chart
- **WHEN** a user selects a different metric from the dropdown
- **THEN** the chart SHALL update to show the newly selected metric
- **AND** the summary cards SHALL NOT change (they always show the predefined business metrics)

#### Scenario: Time range change
- **WHEN** a user changes the time range from 1h to 24h
- **THEN** the chart SHALL refresh with data spanning the last 24 hours
- **AND** the aggregation interval SHALL adjust automatically:
  - 1h → interval=1m
  - 6h → interval=5m
  - 24h → interval=15m
  - 7d → interval=1h

#### Scenario: Auto-refresh (60s)
- **WHEN** the metrics page is open
- **THEN** the data SHALL auto-refresh every 60 seconds (matching Collector scrape interval)
- **AND** the auto-refresh SHALL pause when the page is not visible (document.hidden)

#### Scenario: No data state
- **WHEN** ClickHouse is unreachable or no data exists for the selected metric
- **THEN** the chart SHALL display a message: "当前无数据"
- **AND** the summary cards SHALL show "--" for unavailable values

### REMOVED Requirements

### Requirement: List all metric names (original source table)

**Reason**: Data source migrated from `samples_v2` to `otel_metrics_gauge` + `otel_metrics_sum`
**Migration**: Use new OTel tables `otel_metrics_gauge` and `otel_metrics_sum` instead of `samples_v2`

### Requirement: Query time-series data (original label syntax)

**Reason**: Label filtering migrated from `JSONExtractString(t.labels, 'key')` to `Attributes['key']` Map syntax, removing the need for JOIN with `time_series_v2`
**Migration**: Use `Attributes['key']` syntax instead of `JSONExtractString(labels, 'key')`. The `time_series_v2` table is no longer used.
