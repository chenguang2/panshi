# Datart 指标 SQL 查询

用于在基于 datart 的监控系统中构建图表（折线图、柱状图、数值卡、排行等）。

## 数据源说明

| 项 | 值 |
|---|---|
| 数据库 | `esapm_metrics` |
| 时序表 | `samples_v2`（字段：`metric_name`, `value`, `timestamp_ms`, `fingerprint`） |
| 标签元数据 | `time_series_v2`（字段：`metric_name`, `fingerprint`, `labels`(JSON), `temporality`） |
| 关联方式 | `s.fingerprint = t.fingerprint AND s.metric_name = t.metric_name` |

### Counter vs Gauge

- **Counter（计数器）**：`temporality = 'Cumulative'` 或 metric_name 以 `_total` 结尾。查询需算 rate = `(max(value) - min(value)) / 时间差_秒`
- **Gauge（瞬时值）**：其他。直接 `avg(value)` / `argMax(value, timestamp_ms)`

---

## 现有指标一览

| # | 指标名 | 含义 | Counter/Gauge |
|---|---|---|---|
| 1 | `edge_http_requests_total` | 总请求数 (QPS) | Counter |
| 2 | `edge_nginx_http_current_connections` | Nginx 活跃连接数 | Gauge（按 state 区分） |
| 3 | `edge_metric_errors` | 指标采集错误数 | Counter |
| 4 | `edge_cpu_usage` | CPU 使用率 | Gauge |
| 5 | `edge_memory_usage` | 内存使用率 | Gauge |
| 6 | `edge_latency_avg` | 平均延迟 (ms) | Gauge |
| 7 | `edge_latency_p99` | P99 延迟 (ms) | Gauge |
| 8 | `edge_error_rate` | 错误率 | Gauge |
| 9 | `edge_qps` | 每秒请求数 (QPS) | Gauge |
| 10 | `edge_shared_dict_capacity_bytes` | 共享字典总容量 (字节) | Gauge |
| 11 | `edge_shared_dict_free_space_bytes` | 共享字典剩余空间 (字节) | Gauge |
| 12 | `scrape_duration` | 采集耗时 (秒) | Gauge |
| 13 | `scrape_samples_scraped` | 采集样本数 | Gauge |
| 14 | `scrape_series_added` | 新增时序序列数 | Gauge |
| 15 | `scrape_samples_post_metric_relabeling` | relabel 后的样本数（采集原始样本经历 metric_relabel_configs 过滤后剩余量） | Gauge |

---

## 一、折线图（时间趋势）

### 1. HTTP 请求速率（QPS）

```sql
SELECT
    toStartOfInterval(toDateTime(intDiv(s.timestamp_ms, 1000)), INTERVAL 5 MINUTE) AS bucket,
    greatest((max(s.value) - min(s.value)) / 300, 0) AS req_per_sec,
    count(*) AS sample_count
FROM esapm_metrics.samples_v2 s
JOIN esapm_metrics.time_series_v2 t
  ON s.fingerprint = t.fingerprint AND s.metric_name = t.metric_name
WHERE s.metric_name = 'edge_http_requests_total'
  AND s.timestamp_ms > (toUnixTimestamp(now()) - 3600) * 1000
GROUP BY bucket
ORDER BY bucket
```

### 2. `edge_qps` 直接 QPS

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

### 3. Nginx 当前连接数（按 state 拆分）

```sql
SELECT
    toStartOfInterval(toDateTime(intDiv(s.timestamp_ms, 1000)), INTERVAL 5 MINUTE) AS bucket,
    JSONExtractString(t.labels, 'state') AS state,
    avg(s.value) AS avg_connections
FROM esapm_metrics.samples_v2 s
JOIN esapm_metrics.time_series_v2 t
  ON s.fingerprint = t.fingerprint AND s.metric_name = t.metric_name
WHERE s.metric_name = 'edge_nginx_http_current_connections'
  AND s.timestamp_ms > (toUnixTimestamp(now()) - 3600) * 1000
GROUP BY bucket, state
ORDER BY bucket, state
```

### 4. CPU 使用率

```sql
SELECT
    toStartOfInterval(toDateTime(intDiv(timestamp_ms, 1000)), INTERVAL 5 MINUTE) AS bucket,
    avg(value) AS cpu_pct,
    max(value) AS cpu_max,
    min(value) AS cpu_min
FROM esapm_metrics.samples_v2
WHERE metric_name = 'edge_cpu_usage'
  AND timestamp_ms > (toUnixTimestamp(now()) - 3600) * 1000
GROUP BY bucket
ORDER BY bucket
```

### 5. 内存使用率

```sql
SELECT
    toStartOfInterval(toDateTime(intDiv(timestamp_ms, 1000)), INTERVAL 5 MINUTE) AS bucket,
    avg(value) AS mem_pct,
    max(value) AS mem_max
FROM esapm_metrics.samples_v2
WHERE metric_name = 'edge_memory_usage'
  AND timestamp_ms > (toUnixTimestamp(now()) - 3600) * 1000
GROUP BY bucket
ORDER BY bucket
```

### 6. 平均延迟（edge_latency_avg）

```sql
SELECT
    toStartOfInterval(toDateTime(intDiv(timestamp_ms, 1000)), INTERVAL 5 MINUTE) AS bucket,
    avg(value) AS avg_latency_ms,
    max(value) AS max_latency_ms
FROM esapm_metrics.samples_v2
WHERE metric_name = 'edge_latency_avg'
  AND timestamp_ms > (toUnixTimestamp(now()) - 3600) * 1000
GROUP BY bucket
ORDER BY bucket
```

### 7. P99 延迟（edge_latency_p99）

```sql
SELECT
    toStartOfInterval(toDateTime(intDiv(timestamp_ms, 1000)), INTERVAL 5 MINUTE) AS bucket,
    avg(value) AS p99_latency_ms
FROM esapm_metrics.samples_v2
WHERE metric_name = 'edge_latency_p99'
  AND timestamp_ms > (toUnixTimestamp(now()) - 3600) * 1000
GROUP BY bucket
ORDER BY bucket
```

### 8. 错误率（edge_error_rate）

```sql
SELECT
    toStartOfInterval(toDateTime(intDiv(timestamp_ms, 1000)), INTERVAL 5 MINUTE) AS bucket,
    avg(value) AS error_rate
FROM esapm_metrics.samples_v2
WHERE metric_name = 'edge_error_rate'
  AND timestamp_ms > (toUnixTimestamp(now()) - 3600) * 1000
GROUP BY bucket
ORDER BY bucket
```

### 9. 共享字典容量与剩余空间

```sql
SELECT
    toStartOfInterval(toDateTime(intDiv(s.timestamp_ms, 1000)), INTERVAL 5 MINUTE) AS bucket,
    s.metric_name,
    avg(s.value) AS bytes
FROM esapm_metrics.samples_v2 s
WHERE s.metric_name IN ('edge_shared_dict_capacity_bytes', 'edge_shared_dict_free_space_bytes')
  AND s.timestamp_ms > (toUnixTimestamp(now()) - 3600) * 1000
GROUP BY bucket, metric_name
ORDER BY bucket, metric_name
```

---

## 二、柱状图（分布 / 对比）

### 10. 采集指标（scrape 系列）

```sql
SELECT
    toStartOfInterval(toDateTime(intDiv(timestamp_ms, 1000)), INTERVAL 5 MINUTE) AS bucket,
    metric_name,
    avg(value) AS avg_val,
    max(value) AS max_val
FROM esapm_metrics.samples_v2
WHERE metric_name IN ('scrape_duration', 'scrape_samples_scraped', 'scrape_series_added', 'scrape_samples_post_metric_relabeling')
  AND timestamp_ms > (toUnixTimestamp(now()) - 3600) * 1000
GROUP BY bucket, metric_name
ORDER BY bucket, metric_name
```

### 11. 指标采集错误（edge_metric_errors）

```sql
SELECT
    toStartOfInterval(toDateTime(intDiv(timestamp_ms, 1000)), INTERVAL 5 MINUTE) AS bucket,
    greatest((max(value) - min(value)) / 300, 0) AS error_per_sec
FROM esapm_metrics.samples_v2
WHERE metric_name = 'edge_metric_errors'
  AND timestamp_ms > (toUnixTimestamp(now()) - 3600) * 1000
GROUP BY bucket
ORDER BY bucket
```

---

## 三、数值卡片（最新值 / 汇总）

### 11. Nginx 连接数实时汇总（按 state）

```sql
SELECT
    JSONExtractString(t.labels, 'state') AS state,
    argMax(s.value, s.timestamp_ms) AS latest_value
FROM esapm_metrics.samples_v2 s
JOIN esapm_metrics.time_series_v2 t
  ON s.fingerprint = t.fingerprint AND s.metric_name = t.metric_name
WHERE s.metric_name = 'edge_nginx_http_current_connections'
  AND s.timestamp_ms > (toUnixTimestamp(now()) - 300) * 1000
GROUP BY state
```

### 12. 今日累计请求数

```sql
SELECT
    max(value) AS total_requests
FROM esapm_metrics.samples_v2
WHERE metric_name = 'edge_http_requests_total'
  AND timestamp_ms > toStartOfDay(now()) * 1000
```

### 13. 各指标最新值（最近 5 分钟）

```sql
SELECT
    metric_name,
    argMax(value, timestamp_ms) AS latest_value
FROM esapm_metrics.samples_v2
WHERE timestamp_ms > (toUnixTimestamp(now()) - 300) * 1000
GROUP BY metric_name
ORDER BY metric_name
```

---

## 四、Top N 排行

### 14. 请求量 Top 10 路由

```sql
SELECT
    JSONExtractString(t.labels, 'route_id') AS route_id,
    greatest((max(s.value) - min(s.value)) / 300, 0) AS req_per_sec
FROM esapm_metrics.samples_v2 s
JOIN esapm_metrics.time_series_v2 t
  ON s.fingerprint = t.fingerprint AND s.metric_name = t.metric_name
WHERE s.metric_name = 'edge_http_requests_total'
  AND s.timestamp_ms > (toUnixTimestamp(now()) - 300) * 1000
GROUP BY route_id
ORDER BY req_per_sec DESC
LIMIT 10
```

### 15. 当前连接数 Top 10 节点

```sql
SELECT
    JSONExtractString(t.labels, 'node') AS node_ip,
    argMax(s.value, s.timestamp_ms) AS connections
FROM esapm_metrics.samples_v2 s
JOIN esapm_metrics.time_series_v2 t
  ON s.fingerprint = t.fingerprint AND s.metric_name = t.metric_name
WHERE s.metric_name = 'edge_nginx_http_current_connections'
  AND s.timestamp_ms > (toUnixTimestamp(now()) - 300) * 1000
GROUP BY node_ip
ORDER BY connections DESC
LIMIT 10
```

---

## 附：辅助查询

### 查看可用指标名

```sql
SELECT DISTINCT metric_name
FROM esapm_metrics.samples_v2
ORDER BY metric_name
```

### 查看某个指标有哪些标签维度

```sql
SELECT
    metric_name,
    t.labels
FROM esapm_metrics.time_series_v2 t
WHERE metric_name = 'edge_http_requests_total'
LIMIT 20
```

### 查看指标类型（Counter / Gauge）

```sql
SELECT DISTINCT
    metric_name,
    temporality
FROM esapm_metrics.time_series_v2
ORDER BY metric_name
```
