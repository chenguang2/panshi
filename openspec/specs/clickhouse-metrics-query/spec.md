# clickhouse-metrics-query

## Purpose

提供基于 ClickHouse 的 Edge 网关指标查询与分析功能，包括指标名称列表、时序数据查询、摘要统计等 API，以及前端指标查询页面。

## Requirements

### Requirement: ClickHouse network accessibility

ClickHouse SHALL listen on TCP port 9000 on 0.0.0.0 (not only 127.0.0.1) to allow remote connections from the 磐石 Admin backend server.

Note: 当前测试开发环境暂不配置访问认证。生产部署前 MUST 添加只读账号或 IP 白名单。

#### Scenario: Remote TCP connection succeeds
- **WHEN** a TCP connection is made to 192.168.100.42:9000 from the backend server
- **THEN** the connection SHALL succeed and return the ClickHouse server version

#### Scenario: Query from remote host
- **WHEN** a SELECT query is executed from the backend server against the `esapm_metrics` database
- **THEN** the query SHALL complete and return results

### Requirement: Backend ClickHouse connection

The backend SHALL connect to ClickHouse using `clickhouse-driver` (Python) via TCP protocol and the `esapm_metrics` database.

#### Scenario: Successful connection on startup
- **WHEN** the backend starts up with valid ClickHouse configuration
- **THEN** the ClickHouse client SHALL be initialized and ready for queries
- **AND** the connection pool SHALL be reusable across requests

#### Scenario: Connection failure handling
- **WHEN** ClickHouse is unreachable and a query is attempted
- **THEN** the API SHALL return HTTP 200 with an empty `data` array and a `warning` field

### Requirement: ClickHouse connection configuration

The ClickHouse connection parameters SHALL be configurable via a YAML configuration file `backend/app/config/clickhouse.yaml`.

| Parameter | Default | Description |
|---|---|---|
| `host` | `127.0.0.1` | ClickHouse server hostname |
| `port` | `9000` | ClickHouse TCP port |
| `database` | `esapm_metrics` | Database name |
| `user` | `default` | Username |
| `password` | `""` | Password |
| `connect_timeout` | `5` | Connection timeout in seconds |

#### Scenario: Config file present
- **WHEN** `backend/app/config/clickhouse.yaml` exists with valid configuration
- **THEN** the backend SHALL use those parameters to connect to ClickHouse

#### Scenario: Config file missing or incomplete
- **WHEN** `backend/app/config/clickhouse.yaml` does not exist or has missing fields
- **THEN** the backend SHALL use the default values
- **AND** metrics API endpoints SHALL return empty data without crashing

### Requirement: Feature switch

The metrics monitoring feature SHALL be controlled by the `metrics` feature switch in `backend/features.yaml` and `backend/app/core/features.py` `KNOWN_FEATURES`.

#### Scenario: Feature enabled
- **WHEN** `features.yaml` has `metrics: true`
- **THEN** the menu entry SHALL appear
- **AND** the API endpoints SHALL be registered

#### Scenario: Feature disabled
- **WHEN** `features.yaml` has `metrics: false` or missing
- **THEN** the menu entry SHALL NOT appear
- **AND** the API endpoints SHALL still be registered but return 404 when accessed directly

### Requirement: List all metric names

The API SHALL provide an endpoint `GET /api/v1/metrics/names` that returns all distinct `metric_name` values from `esapm_metrics.samples_v2`.

#### Scenario: Get metric names
- **WHEN** a GET request is sent to `/api/v1/metrics/names`
- **THEN** the response SHALL contain a JSON array of metric names (strings)
- **AND** each name SHALL be a unique metric_name from the samples_v2 table

### Requirement: Query time-series data

The API SHALL provide an endpoint `GET /api/v1/metrics/{metric_name}` for querying time-series data with the following query parameters:

| Parameter | Type | Default | Description |
|---|---|---|---|
| `since` | string | `1h` | Time range: `1h`, `6h`, `24h`, `7d`, or ISO datetime |
| `interval` | string | `5m` | Aggregation interval: `1m`, `5m`, `15m`, `1h` |
| `label` | string | (optional) | Label filter in `key:value` format, e.g. `state:active`. Uses `JSONExtractString(labels, 'key') = 'value'` for precise matching. |

The response SHALL contain an array of buckets with `timestamp`, `avg`, `max`, `min`, `sample_count` fields.

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

#### Scenario: Counter auto-detection
- **WHEN** a query is executed
- **THEN** the backend SHALL determine if the metric is a Counter by checking `temporality = 'Cumulative'` in `time_series_v2`
- **AND** SHALL calculate rate for Counter metrics: `rate = (max(value) - min(value)) / time_delta_seconds`
- **AND** SHALL return raw values for Gauge metrics (temporality = 'Unspecified' or others)

#### Scenario: Counter rate calculation
- **WHEN** querying `edge_http_requests_total` (a Counter-type metric with Cumulative temporality)
- **THEN** the response SHALL contain rate values (not raw cumulative values)
- **AND** negative rate values SHALL be clamped to 0

#### Scenario: Counter single sample point
- **WHEN** querying a Counter metric and a bucket contains only one data point
- **THEN** the rate value for that bucket SHALL be 0
- **AND** the `sample_count` field SHALL be 1

### Requirement: Metrics summary endpoint

The API SHALL provide an endpoint `GET /api/v1/metrics/summary` that returns the latest value for each metric.

The summary SHALL aggregate by metric_name only (not by label combination), returning the latest sampled value per metric.

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
- `edge_metric_errors` — metric scrape errors

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

### Requirement: Menu integration

The metrics monitoring page SHALL be accessible from the sidebar navigation menu.

#### Scenario: Menu item visible
- **WHEN** a user logs into 磐石 Admin
- **THEN** "指标监控" SHALL appear in the sidebar navigation menu
- **AND** clicking it SHALL navigate to the `/metrics` route
