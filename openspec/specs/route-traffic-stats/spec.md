# Route Traffic Stats

## Purpose

Provides route-level traffic statistics (QPS, bandwidth, error rate, latency) using ClickHouse metrics, enabling operators to identify high-traffic routes, troubleshoot errors, and monitor performance.

## Requirements

### Requirement: Route QPS Statistics
The system SHALL provide route-level QPS (Queries Per Second) statistics using the `edge_http_status` metric from the `otel_metrics_sum` table.

#### Scenario: Query route QPS ranking
- **WHEN** a GET request is sent to `/api/v1/metrics/route-stats` with `type=qps` and `since=24h`
- **THEN** the response SHALL contain a JSON array of route statistics sorted by QPS descending
- **AND** each entry SHALL include `route_id`, `uri`, `requests_per_sec`, `total_requests`, and `sample_count` fields
- **AND** the response SHALL be limited to top 10 routes by default
- **AND** when `sample_count = 1`, `requests_per_sec` SHALL be 0 (cold start scenario)

#### Scenario: Query with custom limit
- **WHEN** a GET request is sent to `/api/v1/metrics/route-stats` with `limit=20`
- **THEN** the response SHALL contain up to 20 route statistics

#### Scenario: Invalid type parameter
- **WHEN** a GET request is sent to `/api/v1/metrics/route-stats` with `type=invalid`
- **THEN** the response SHALL return HTTP 400 with error message "Invalid type. Valid: qps, bandwidth, error_rate, latency"

#### Scenario: Invalid since parameter
- **WHEN** a GET request is sent to `/api/v1/metrics/route-stats` with `since=invalid`
- **THEN** the system SHALL use default value `1h`

#### Scenario: Invalid limit parameter
- **WHEN** a GET request is sent to `/api/v1/metrics/route-stats` with `limit=-1` or `limit=200`
- **THEN** the system SHALL use default value `10`, with maximum `100`

### Requirement: Route Bandwidth Statistics
The system SHALL provide route-level bandwidth statistics using the `edge_bandwidth` metric from the `otel_metrics_sum` table.

#### Scenario: Query route bandwidth ranking
- **WHEN** a GET request is sent to `/api/v1/metrics/route-stats` with `type=bandwidth` and `since=24h`
- **THEN** the response SHALL contain a JSON array of route bandwidth statistics sorted by total bytes descending
- **AND** each entry SHALL include `route_id`, `direction` (ingress/egress), `bytes_per_sec`, and `total_bytes` fields

### Requirement: Route Error Rate Statistics
The system SHALL provide route-level error rate statistics using the `edge_http_status` metric from the `otel_metrics_sum` table.

#### Scenario: Query route error rate ranking
- **WHEN** a GET request is sent to `/api/v1/metrics/route-stats` with `type=error_rate` and `since=24h`
- **THEN** the response SHALL contain a JSON array of route error rate statistics sorted by error rate descending
- **AND** each entry SHALL include `route_id`, `uri`, `client_errors` (4xx), `server_errors` (5xx), `total_requests`, and `error_rate_pct` fields
- **AND** routes with zero total requests SHALL be excluded

### Requirement: Route Latency Statistics
The system SHALL provide route-level latency statistics using the `edge_http_latency` metric from the `otel_metrics_histogram` table.

#### Scenario: Query route latency ranking
- **WHEN** a GET request is sent to `/api/v1/metrics/route-stats` with `type=latency` and `since=24h`
- **THEN** the response SHALL contain a JSON array of route latency statistics sorted by average latency descending
- **AND** each entry SHALL include `route_id`, `latency_type`, `avg_latency_ms`, `max_latency_ms`, and `sample_count` fields
- **AND** the default `latency_type` SHALL be `request`

#### Scenario: Query with specific latency type
- **WHEN** a GET request is sent to `/api/v1/metrics/route-stats` with `type=latency` and `latency_type=upstream`
- **THEN** the response SHALL contain latency statistics for the specified type
- **AND** valid `latency_type` values are: `client_send`, `upstream`, `request`, `edge`, `client_recv`

### Requirement: Empty Data Response
The system SHALL return appropriate responses when no data is available.

#### Scenario: No data for query
- **WHEN** a GET request returns no data
- **THEN** the response SHALL return HTTP 200 with empty `data` array
- **AND** the response SHALL include `warning` field with message "No data available for the specified time range"

### Requirement: ClickHouse Connection Failure
The system SHALL gracefully handle ClickHouse connection failures.

#### Scenario: ClickHouse unavailable
- **WHEN** ClickHouse connection fails or times out
- **THEN** the response SHALL return HTTP 200 with empty `data` array
- **AND** the response SHALL include `error` field with failure reason
- **AND** the frontend SHALL display "数据暂时不可用，请稍后重试"

### Requirement: Query Result Caching
The system SHALL cache query results to reduce ClickHouse load.

#### Scenario: Cache hit
- **WHEN** a query is executed within 30 seconds of a previous identical query
- **THEN** the system SHALL return cached results
- **AND** the cache key SHALL include query parameters and current minute

#### Scenario: Cache miss
- **WHEN** a query is executed after cache expiry (30 seconds)
- **THEN** the system SHALL execute the query against ClickHouse
- **AND** the result SHALL be cached for subsequent requests

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
