# clickhouse-metrics-query Delta

## MODIFIED Requirements

### Requirement: Query time-series data

The API SHALL provide an endpoint `GET /api/v1/metrics/{metric_name}` for querying time-series data with the following query parameters:

| Parameter | Type | Default | Description |
|---|---|---|---|
| `since` | string | `1h` | Time range: `1h`, `6h`, `24h`, `7d`, or ISO datetime |
| `interval` | string | `5m` | Aggregation interval: `1m`, `5m`, `15m`, `1h` |
| `label` | string | (optional) | Label filter in `key:value` format, e.g. `state:active`. Uses `Attributes['key'] = 'value'` for precise matching (Map syntax). |

The response SHALL contain an array of buckets with `timestamp`, `avg`, `max`, `min`, `sample_count` fields.

The data source SHALL be `otel_metrics_gauge` for Gauge metrics. Sum/Counter metrics SHALL use `otel_metrics_sum`.

The `label` key SHALL be restricted to a server-side whitelist of allowed label keys; a key outside the whitelist SHALL be rejected with 400 instead of being interpolated into ClickHouse SQL.

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

#### Scenario: Label key outside the whitelist is rejected
- **WHEN** a GET request carries a `label` parameter whose key is not in the server-side whitelist (e.g. `label=evil:1`)
- **THEN** the endpoint SHALL respond 400 with a validation error
- **AND** the key SHALL never reach the ClickHouse SQL text

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
