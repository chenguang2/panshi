# ClickHouse SQL 迁移指南

> 从旧表 `esapm_metrics.samples_v2` / `time_series_v2` 迁移到新表 `otel_metrics_gauge` / `otel_metrics_sum` 的等价 SQL 对照。

## 表结构变化

| 旧 | 新 |
|---|---|
| `esapm_metrics.samples_v2` | `otel_metrics_gauge`（Gauge 类型）或 `otel_metrics_sum`（Counter 类型） |
| `esapm_metrics.time_series_v2` | 无需 JOIN，`Attributes` 字段已内嵌于 OTel 表中 |
| `metric_name` | `MetricName` |
| `timestamp_ms`（毫秒） | `TimeUnix`（秒） |
| `value` | `Value` |
| `JSONExtractString(labels, 'key')` | `Attributes['key']` |

## 指标名映射

| 旧指标名 | 新指标名 | 所在表 |
|---|---|---|
| `edge_http_requests_total` | `edge_http_requests_total` | `otel_metrics_gauge` |
| `edge_nginx_http_current_connections` | `edge_nginx_http_current_connections` | `otel_metrics_gauge` |
| `edge_metric_errors` | `edge_metric_errors_total` | `otel_metrics_sum` |
| `edge_qps` | 无独立指标，从 `edge_http_requests_total` 差分推导 | `otel_metrics_gauge` |
| `scrape_duration` | `scrape_duration_seconds` | `otel_metrics_gauge` |
| `edge_http_status` | `edge_http_status` | `otel_metrics_sum` |
| `edge_bandwidth` | `edge_bandwidth` | `otel_metrics_sum` |
| `edge_http_latency` | `edge_http_latency_max` / `edge_http_latency_min` | `otel_metrics_gauge` |

## 1. HTTP 请求总量（今日累计）

**旧 SQL：**
```sql
SELECT max(value) AS total_requests
FROM esapm_metrics.samples_v2
WHERE (metric_name = 'edge_http_requests_total')
  AND (timestamp_ms > (toUnixTimestamp(toStartOfDay(now())) * 1000))
```

**新 SQL：**
```sql
SELECT max(Value) AS total_requests
FROM otel_metrics_gauge
WHERE MetricName = 'edge_http_requests_total'
  AND TimeUnix > toStartOfDay(now())
```

**关键转换：**
- 表：`samples_v2` → `otel_metrics_gauge`
- 时间：`timestamp_ms > (toUnixTimestamp(toStartOfDay(now())) * 1000)` → `TimeUnix > toStartOfDay(now())`
- 字段：`metric_name` → `MetricName`，`value` → `Value`

## 2. Nginx 连接状态（含 JOIN）

**旧 SQL：**
```sql
SELECT
    toInt64(avgIf(s.value, JSONExtractString(t.labels, 'state') = 'active'))   AS active,
    toInt64(avgIf(s.value, JSONExtractString(t.labels, 'state') = 'handled'))  AS handled,
    toInt64(avgIf(s.value, JSONExtractString(t.labels, 'state') = 'writing'))  AS writing,
    toInt64(avgIf(s.value, JSONExtractString(t.labels, 'state') = 'accepted')) AS accepted,
    toInt64(avgIf(s.value, JSONExtractString(t.labels, 'state') = 'waiting'))  AS waiting,
    toInt64(avgIf(s.value, JSONExtractString(t.labels, 'state') = 'reading'))  AS reading
FROM esapm_metrics.samples_v2 s
JOIN esapm_metrics.time_series_v2 t
  ON s.fingerprint = t.fingerprint AND s.metric_name = t.metric_name
WHERE s.metric_name = 'edge_nginx_http_current_connections'
  AND s.timestamp_ms > (toUnixTimestamp(now()) - 3600) * 1000
```

**新 SQL：**
```sql
SELECT
    toInt64(avgIf(Value, Attributes['state'] = 'active'))   AS active,
    toInt64(avgIf(Value, Attributes['state'] = 'handled'))  AS handled,
    toInt64(avgIf(Value, Attributes['state'] = 'writing'))  AS writing,
    toInt64(avgIf(Value, Attributes['state'] = 'accepted')) AS accepted,
    toInt64(avgIf(Value, Attributes['state'] = 'waiting'))  AS waiting,
    toInt64(avgIf(Value, Attributes['state'] = 'reading'))  AS reading
FROM otel_metrics_gauge
WHERE MetricName = 'edge_nginx_http_current_connections'
  AND TimeUnix > now() - INTERVAL 3600 SECOND
```

**关键转换：**
- 无需 JOIN，`Attributes` 已内嵌
- `JSONExtractString(t.labels, 'state')` → `Attributes['state']`
- 时间：`(toUnixTimestamp(now()) - 3600) * 1000` → `now() - INTERVAL 3600 SECOND`

## 3. Metric 错误率（累计计数器差分）

**旧 SQL：**
```sql
SELECT greatest((max(value) - min(value)) / 300, 0) AS error_per_sec
FROM esapm_metrics.samples_v2
WHERE metric_name = 'edge_metric_errors'
  AND timestamp_ms > (toUnixTimestamp(now()) - 3600) * 1000
```

**新 SQL：**
```sql
SELECT greatest((max(Value) - min(Value)) / 300, 0) AS error_per_sec
FROM otel_metrics_sum
WHERE MetricName = 'edge_metric_errors_total'
  AND TimeUnix > now() - INTERVAL 3600 SECOND
```

**关键转换：**
- 表：`samples_v2` → `otel_metrics_sum`（累计计数器）
- 指标名：`edge_metric_errors` → `edge_metric_errors_total`（加 `_total` 后缀）

## 4. QPS 时序（累计计数器差分求速率）

**旧 SQL：**
```sql
SELECT
    toStartOfInterval(toDateTime(intDiv(timestamp_ms, 1000)), INTERVAL 5 MINUTE) AS bucket,
    avg(value) AS qps
FROM esapm_metrics.samples_v2
WHERE metric_name = 'edge_qps'
  AND timestamp_ms > (toUnixTimestamp(now()) - 3600) * 1000
GROUP BY bucket
ORDER BY bucket
```

**新 SQL：**
```sql
SELECT
    toStartOfInterval(TimeUnix, INTERVAL 5 MINUTE) AS bucket,
    greatest((max(Value) - min(Value)) / 300, 0) AS qps
FROM otel_metrics_gauge
WHERE MetricName = 'edge_http_requests_total'
  AND TimeUnix > now() - INTERVAL 3600 SECOND
GROUP BY bucket
ORDER BY bucket
```

**关键转换：**
- 新表无独立 `edge_qps` 指标，从 `edge_http_requests_total`（累计计数器）差分推导
- `avg(value)`（已是速率）→ `(max(Value) - min(Value)) / 300`（差分求速率）
- `toStartOfInterval(toDateTime(intDiv(timestamp_ms,1000)), INTERVAL 5 MINUTE)` → `toStartOfInterval(TimeUnix, INTERVAL 5 MINUTE)`

## 5. Scrape 耗时（时序分桶）

**旧 SQL：**
```sql
SELECT
    toStartOfInterval(toDateTime(intDiv(timestamp_ms, 1000)), INTERVAL 5 MINUTE) AS bucket,
    metric_name,
    avg(value) AS avg_val,
    max(value) AS max_val
FROM esapm_metrics.samples_v2
WHERE metric_name = 'scrape_duration'
  AND timestamp_ms > (toUnixTimestamp(now()) - 3600) * 1000
GROUP BY bucket, metric_name
ORDER BY bucket, metric_name
```

**新 SQL：**
```sql
SELECT
    toStartOfInterval(TimeUnix, INTERVAL 5 MINUTE) AS bucket,
    MetricName,
    avg(Value) AS avg_val,
    max(Value) AS max_val
FROM otel_metrics_gauge
WHERE MetricName = 'scrape_duration_seconds'
  AND TimeUnix > now() - INTERVAL 3600 SECOND
GROUP BY bucket, MetricName
ORDER BY bucket, MetricName
```

**关键转换：**
- 表：`samples_v2` → `otel_metrics_gauge`
- 指标名：`scrape_duration` → `scrape_duration_seconds`（加 `_seconds` 后缀）
- 时间：`toStartOfInterval(toDateTime(intDiv(timestamp_ms,1000)), INTERVAL 5 MINUTE)` → `toStartOfInterval(TimeUnix, INTERVAL 5 MINUTE)`
- 字段：`metric_name` → `MetricName`，`value` → `Value`

## 注意事项

1. **Counter vs Gauge**：新表将指标分为 `otel_metrics_sum`（累计计数器）和 `otel_metrics_gauge`（瞬时值）。使用前需确认指标所在表。
2. **累计计数器处理**：旧表的 `avg(value)` 对于计数器是无效的，新表需用 `(max(Value) - min(Value)) / interval` 差分计算速率。
3. **时间精度**：`TimeUnix` 为秒级精度，无需毫秒转换。
4. **标签访问**：旧表需 JOIN `time_series_v2` 获取标签，新表 `Attributes` 字段直接包含所有标签，无需 JOIN。

edge-qps
edge_http_requests_total
edge_nginx_http_current_connections
edge_metric_errors
scrape
