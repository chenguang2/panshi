# ClickHouse 指标 SQL 查询（OTel 新表）

用于在 DBeaver 或监控系统中直接查询 ClickHouse 指标数据。

## 数据源说明

| 项 | 值 |
|---|---|
| 数据库 | `esapm_metrics` |
| 连接地址 | `192.168.100.42:9000` (TCP) |
| 用户名 | `default` |
| 密码 | (空) |

### 新旧表对比

| 维度 | 旧表（v2） | 新表（OTel） |
|---|---|---|
| 表名 | `samples_v2` | `otel_metrics_gauge` / `otel_metrics_sum` / `otel_metrics_histogram` |
| 标签元数据 | `time_series_v2`（需 JOIN） | `Attributes`（Map 类型，内联） |
| 指标名列 | `metric_name` | `MetricName` |
| 值列 | `value` (Float64) | `Value` (Float64) |
| 时间列 | `timestamp_ms` (Int64, ms) | `TimeUnix` (DateTime64(9), ns) |
| 标签访问 | `JSONExtractString(labels, 'key')` | `Attributes['key']` |

### OTel 表结构

**otel_metrics_gauge** (Gauge 类型指标)：
| 字段 | 类型 | 说明 |
|---|---|---|
| `MetricName` | String | 指标名称 |
| `Value` | Float64 | 指标值 |
| `TimeUnix` | DateTime64(9) | 时间戳（纳秒） |
| `Attributes` | Map(String, String) | 标签键值对 |
| `ServiceName` | LowCardinality(String) | 服务名 |

**otel_metrics_sum** (Counter 类型指标)：
| 字段 | 类型 | 说明 |
|---|---|---|
| `MetricName` | String | 指标名称 |
| `Value` | Float64 | 累计值 |
| `TimeUnix` | DateTime64(9) | 时间戳（纳秒） |
| `Attributes` | Map(String, String) | 标签键值对 |
| `IsMonotonic` | UInt8 | 是否单调递增 (1=是) |
| `AggregationTemporality` | UInt8 | 聚合时态 (2=Cumulative) |

**otel_metrics_histogram** (直方图指标)：
| 字段 | 类型 | 说明 |
|---|---|---|
| `MetricName` | String | 指标名称 |
| `Count` | UInt64 | 样本数量 |
| `Sum` | Float64 | 总和 |
| `Min` | Float64 | 最小值 |
| `Max` | Float64 | 最大值 |
| `BucketCounts` | Array(UInt64) | 各桶计数 |
| `ExplicitBounds` | Array(Float64) | 桶边界 |
| `TimeUnix` | DateTime64(9) | 时间戳（纳秒） |
| `Attributes` | Map(String, String) | 标签键值对 |

---

## 实际指标分布

| 表 | 包含的指标 |
|---|---|
| `otel_metrics_gauge` | `edge_http_requests_total`, `edge_nginx_http_current_connections`, `edge_shared_dict_capacity_bytes`, `edge_shared_dict_free_space_bytes`, `scrape_duration_seconds`, `scrape_samples_scraped`, `scrape_series_added`, `scrape_samples_post_metric_relabeling`, `up` |
| `otel_metrics_sum` | `edge_metric_errors_total`, `edge_http_status`, `edge_bandwidth` |
| `otel_metrics_histogram` | `edge_http_latency`, `edge_plugin_latency` |

---

## Counter vs Gauge 检测

- **Counter（计数器）**：`otel_metrics_sum` 表中 `IsMonotonic=1 AND AggregationTemporality=2`，或指标名以 `_total` 结尾
- **Gauge（瞬时值）**：其他。直接 `avg(Value)` / `argMax(Value, TimeUnix)`

**Counter 查询需算 rate**：`rate = (max(Value) - min(Value)) / 时间差_秒`

---

## 一、折线图（时间趋势）

### 1. HTTP 请求速率（QPS）

```sql
SELECT
    toUnixTimestamp(toStartOfInterval(TimeUnix, INTERVAL 900 SECOND)) AS bucket,
    greatest((max(Value) - min(Value)) / 900, 0) AS req_per_sec,
    count(*) AS sample_count
FROM otel_metrics_gauge
WHERE MetricName = 'edge_http_requests_total'
  AND TimeUnix > now() - INTERVAL 86400 SECOND
GROUP BY bucket
ORDER BY bucket
```

### 2. Nginx 当前连接数（按 state 拆分）

```sql
-- 折线图
SELECT
    toUnixTimestamp(toStartOfInterval(TimeUnix, INTERVAL 900 SECOND)) AS bucket,
    Attributes['state'] AS state,
    avg(Value) AS avg_connections
FROM otel_metrics_gauge
WHERE MetricName = 'edge_nginx_http_current_connections'
  AND TimeUnix > now() - INTERVAL 86400 SECOND
GROUP BY bucket, state
ORDER BY bucket, state

-- 多卡片显示（行转列）
SELECT
    toInt64(avgIf(Value, Attributes['state'] = 'active'))   AS active,
    toInt64(avgIf(Value, Attributes['state'] = 'handled'))  AS handled,
    toInt64(avgIf(Value, Attributes['state'] = 'writing'))  AS writing,
    toInt64(avgIf(Value, Attributes['state'] = 'accepted')) AS accepted,
    toInt64(avgIf(Value, Attributes['state'] = 'waiting'))  AS waiting,
    toInt64(avgIf(Value, Attributes['state'] = 'reading'))  AS reading
FROM otel_metrics_gauge
WHERE MetricName = 'edge_nginx_http_current_connections'
  AND TimeUnix > now() - INTERVAL 86400 SECOND
```

### 3. 共享字典容量与剩余空间

```sql
SELECT
    toUnixTimestamp(toStartOfInterval(TimeUnix, INTERVAL 900 SECOND)) AS bucket,
    MetricName,
    avg(Value) AS bytes
FROM otel_metrics_gauge
WHERE MetricName IN ('edge_shared_dict_capacity_bytes', 'edge_shared_dict_free_space_bytes')
  AND TimeUnix > now() - INTERVAL 86400 SECOND
GROUP BY bucket, MetricName
ORDER BY bucket, MetricName
```

---

## 二、柱状图（分布 / 对比）

### 4. 采集指标（scrape 系列）

```sql
SELECT
    toUnixTimestamp(toStartOfInterval(TimeUnix, INTERVAL 900 SECOND)) AS bucket,
    MetricName,
    avg(Value) AS avg_val,
    max(Value) AS max_val
FROM otel_metrics_gauge
WHERE MetricName IN ('scrape_duration_seconds', 'scrape_samples_scraped', 'scrape_series_added', 'scrape_samples_post_metric_relabeling')
  AND TimeUnix > now() - INTERVAL 86400 SECOND
GROUP BY bucket, MetricName
ORDER BY bucket, MetricName
```

### 5. 指标采集错误（edge_metric_errors_total）

```sql
SELECT
    toUnixTimestamp(toStartOfInterval(TimeUnix, INTERVAL 900 SECOND)) AS bucket,
    greatest((max(Value) - min(Value)) / 900, 0) AS error_per_sec
FROM otel_metrics_sum
WHERE MetricName = 'edge_metric_errors_total'
  AND TimeUnix > now() - INTERVAL 86400 SECOND
GROUP BY bucket
ORDER BY bucket
```

---

## 三、数值卡片（最新值 / 汇总）

### 6. Nginx 连接数实时汇总（按 state）

```sql
SELECT
    Attributes['state'] AS state,
    argMax(Value, TimeUnix) AS latest_value
FROM otel_metrics_gauge
WHERE MetricName = 'edge_nginx_http_current_connections'
  AND TimeUnix > now() - INTERVAL 300 SECOND
GROUP BY state
```

### 7. 今日累计请求数

```sql
SELECT
    max(Value) AS total_requests
FROM otel_metrics_gauge
WHERE MetricName = 'edge_http_requests_total'
  AND TimeUnix > toStartOfDay(now())
```

### 8. 各指标最新值（最近 5 分钟）

```sql
SELECT
    MetricName,
    argMax(Value, TimeUnix) AS latest_value
FROM (
    SELECT MetricName, Value, TimeUnix FROM otel_metrics_gauge
    UNION ALL
    SELECT MetricName, Value, TimeUnix FROM otel_metrics_sum
)
WHERE TimeUnix > now() - INTERVAL 300 SECOND
GROUP BY MetricName
ORDER BY MetricName
```

---

## 四、Top N 排行

### 9. 请求量 Top 10 路由（使用 edge_http_status）

```sql
SELECT
    Attributes['route'] AS route_id,
    Attributes['matched_uri'] AS uri,
    max(Value) - min(Value) AS total_requests
FROM otel_metrics_sum
WHERE MetricName = 'edge_http_status'
  AND TimeUnix > now() - INTERVAL 86400 SECOND
GROUP BY route_id, uri
ORDER BY total_requests DESC
LIMIT 10
```

### 10. 当前连接数 Top 10 节点

```sql
SELECT
    Attributes['ip'] AS node_ip,
    argMax(Value, TimeUnix) AS connections
FROM otel_metrics_gauge
WHERE MetricName = 'edge_nginx_http_current_connections'
  AND TimeUnix > now() - INTERVAL 300 SECOND
GROUP BY node_ip
ORDER BY connections DESC
LIMIT 10
```

---

## 五、路由流量统计（新功能）

### 11. 按路由统计请求速率

```sql
SELECT
    Attributes['route'] AS route_id,
    Attributes['code'] AS status_code,
    toUnixTimestamp(toStartOfInterval(TimeUnix, INTERVAL 900 SECOND)) AS bucket,
    greatest((max(Value) - min(Value)) / 900, 0) AS requests_per_second
FROM otel_metrics_sum
WHERE MetricName = 'edge_http_status'
  AND TimeUnix > now() - INTERVAL 86400 SECOND
GROUP BY route_id, status_code, bucket
ORDER BY bucket, route_id, status_code
```

### 12. 按路由统计总请求数

```sql
SELECT
    Attributes['route'] AS route_id,
    Attributes['matched_uri'] AS uri,
    max(Value) - min(Value) AS total_requests
FROM otel_metrics_sum
WHERE MetricName = 'edge_http_status'
  AND TimeUnix > now() - INTERVAL 86400 SECOND
GROUP BY route_id, uri
ORDER BY total_requests DESC
```

### 13. 按路由统计带宽（入/出）

```sql
SELECT
    Attributes['route'] AS route_id,
    Attributes['type'] AS direction,  -- ingress/egress
    toUnixTimestamp(toStartOfInterval(TimeUnix, INTERVAL 900 SECOND)) AS bucket,
    greatest((max(Value) - min(Value)) / 900, 0) AS bytes_per_second
FROM otel_metrics_sum
WHERE MetricName = 'edge_bandwidth'
  AND TimeUnix > now() - INTERVAL 86400 SECOND
GROUP BY route_id, direction, bucket
ORDER BY bucket, route_id, direction
```

### 14. 按路由统计延迟（直方图）

```sql
SELECT
    Attributes['route'] AS route_id,
    Attributes['type'] AS latency_type,  -- client_send, upstream, request, edge
    avg(Sum / Count) AS avg_latency_ms,
    max(Max) AS max_latency_ms,
    min(Min) AS min_latency_ms
FROM otel_metrics_histogram
WHERE MetricName = 'edge_http_latency'
  AND TimeUnix > now() - INTERVAL 3600 SECOND
GROUP BY route_id, latency_type
ORDER BY route_id, latency_type
```

### 15. 按路由统计状态码分布

```sql
SELECT
    Attributes['route'] AS route_id,
    Attributes['code'] AS status_code,
    max(Value) - min(Value) AS request_count
FROM otel_metrics_sum
WHERE MetricName = 'edge_http_status'
  AND TimeUnix > now() - INTERVAL 86400 SECOND
GROUP BY route_id, status_code
ORDER BY route_id, request_count DESC
```

---

## 六、延迟分析（直方图）

### 16. HTTP 延迟分布

```sql
SELECT
    Attributes['type'] AS latency_type,  -- client_send, upstream, request, edge, client_recv
    avg(Sum / Count) AS avg_latency_ms,
    max(Max) AS max_latency_ms,
    min(Min) AS min_latency_ms,
    count(*) AS sample_count
FROM otel_metrics_histogram
WHERE MetricName = 'edge_http_latency'
  AND TimeUnix > now() - INTERVAL 3600 SECOND
GROUP BY latency_type
ORDER BY latency_type
```

### 17. 插件延迟分布

```sql
SELECT
    Attributes['name'] AS plugin_name,
    avg(Sum / Count) AS avg_latency_ms,
    max(Max) AS max_latency_ms,
    count(*) AS sample_count
FROM otel_metrics_histogram
WHERE MetricName = 'edge_plugin_latency'
  AND TimeUnix > now() - INTERVAL 3600 SECOND
GROUP BY plugin_name
ORDER BY avg_latency_ms DESC
```

---

## 七、补充统计（缺失项）

### 18. 路由 QPS 排行（用 edge_http_status 替代）

> ⚠️ `edge_http_requests_total` 无路由标签，需用 `edge_http_status` 的 Sum 值计算

```sql
SELECT
    Attributes['route'] AS route_id,
    Attributes['matched_uri'] AS uri,
    greatest((max(Value) - min(Value)) / 900, 0) AS requests_per_sec,
    max(Value) - min(Value) AS total_requests
FROM otel_metrics_sum
WHERE MetricName = 'edge_http_status'
  AND TimeUnix > now() - INTERVAL 86400 SECOND
GROUP BY route_id, uri
ORDER BY requests_per_sec DESC
LIMIT 10
```

### 19. HTTP 状态码分类统计（2xx/3xx/4xx/5xx）

```sql
SELECT
    CASE
        WHEN Attributes['code'] LIKE '2%' THEN '2xx'
        WHEN Attributes['code'] LIKE '3%' THEN '3xx'
        WHEN Attributes['code'] LIKE '4%' THEN '4xx'
        WHEN Attributes['code'] LIKE '5%' THEN '5xx'
        ELSE Attributes['code']
    END AS status_class,
    max(Value) - min(Value) AS request_count,
    round(max(Value) - min(Value) * 100.0 / 
          (SELECT max(Value) - min(Value) FROM otel_metrics_sum 
           WHERE MetricName = 'edge_http_status' AND TimeUnix > now() - INTERVAL 86400 SECOND), 2) AS percentage
FROM otel_metrics_sum
WHERE MetricName = 'edge_http_status'
  AND TimeUnix > now() - INTERVAL 86400 SECOND
GROUP BY status_class
ORDER BY request_count DESC
```

### 20. 路由带宽 Top 10

```sql
SELECT
    Attributes['route'] AS route_id,
    Attributes['type'] AS direction,  -- ingress/egress
    greatest((max(Value) - min(Value)) / 900, 0) AS bytes_per_sec,
    max(Value) - min(Value) AS total_bytes
FROM otel_metrics_sum
WHERE MetricName = 'edge_bandwidth'
  AND TimeUnix > now() - INTERVAL 86400 SECOND
GROUP BY route_id, direction
ORDER BY total_bytes DESC
LIMIT 10
```

### 21. 路由错误率排行（4xx + 5xx）

```sql
SELECT
    Attributes['route'] AS route_id,
    Attributes['matched_uri'] AS uri,
    sumIf(max(Value) - min(Value), Attributes['code'] LIKE '4%') AS client_errors,
    sumIf(max(Value) - min(Value), Attributes['code'] LIKE '5%') AS server_errors,
    sum(max(Value) - min(Value)) AS total_requests,
    round((sumIf(max(Value) - min(Value), Attributes['code'] LIKE '4%') + 
           sumIf(max(Value) - min(Value), Attributes['code'] LIKE '5%')) * 100.0 / 
          sum(max(Value) - min(Value)), 2) AS error_rate_pct
FROM otel_metrics_sum
WHERE MetricName = 'edge_http_status'
  AND TimeUnix > now() - INTERVAL 86400 SECOND
GROUP BY route_id, uri
HAVING total_requests > 0
ORDER BY error_rate_pct DESC
LIMIT 10
```

### 22. 路由延迟排行（P99 近似值）

```sql
SELECT
    Attributes['route'] AS route_id,
    Attributes['type'] AS latency_type,
    avg(Sum / Count) AS avg_latency_ms,
    max(Max) AS max_latency_ms,
    count(*) AS sample_count
FROM otel_metrics_histogram
WHERE MetricName = 'edge_http_latency'
  AND TimeUnix > now() - INTERVAL 86400 SECOND
GROUP BY route_id, latency_type
HAVING latency_type = 'request'
ORDER BY avg_latency_ms DESC
LIMIT 10
```

### 23. 今日 vs 昨日对比（环比）

```sql
-- 今日请求量
SELECT
    max(Value) - min(Value) AS today_requests
FROM otel_metrics_sum
WHERE MetricName = 'edge_http_status'
  AND TimeUnix > toStartOfDay(now())

-- 昨日请求量
SELECT
    max(Value) - min(Value) AS yesterday_requests
FROM otel_metrics_sum
WHERE MetricName = 'edge_http_status'
  AND TimeUnix > toStartOfDay(now()) - INTERVAL 1 DAY
  AND TimeUnix <= toStartOfDay(now())
```

### 24. 按小时统计请求量分布（热力图数据）

```sql
SELECT
    toHour(TimeUnix) AS hour_of_day,
    toDayOfWeek(TimeUnix) AS day_of_week,
    max(Value) - min(Value) AS request_count
FROM otel_metrics_sum
WHERE MetricName = 'edge_http_status'
  AND TimeUnix > now() - INTERVAL 7 DAY
GROUP BY hour_of_day, day_of_week
ORDER BY day_of_week, hour_of_day
```

### 25. 节点健康状态（up 指标）

```sql
SELECT
    Attributes['ip'] AS node_ip,
    argMax(Value, TimeUnix) AS status,  -- 1=健康, 0=异常
    max(TimeUnix) AS last_seen
FROM otel_metrics_gauge
WHERE MetricName = 'up'
  AND TimeUnix > now() - INTERVAL 300 SECOND
GROUP BY node_ip
ORDER BY status ASC, last_seen DESC
```

### 26. 资源使用率汇总（共享字典）

```sql
SELECT
    Attributes['name'] AS dict_name,
    Attributes['ip'] AS node_ip,
    argMax(Value, TimeUnix) AS latest_value
FROM otel_metrics_gauge
WHERE MetricName IN ('edge_shared_dict_capacity_bytes', 'edge_shared_dict_free_space_bytes')
  AND TimeUnix > now() - INTERVAL 300 SECOND
GROUP BY dict_name, node_ip
ORDER BY dict_name, node_ip
```

---

## 附：辅助查询

### 查看所有表

```sql
SHOW TABLES FROM esapm_metrics
```

### 查看表结构

```sql
DESCRIBE TABLE otel_metrics_gauge
DESCRIBE TABLE otel_metrics_sum
DESCRIBE TABLE otel_metrics_histogram
```

### 查看可用指标名

```sql
SELECT DISTINCT MetricName FROM otel_metrics_gauge
UNION DISTINCT
SELECT DISTINCT MetricName FROM otel_metrics_sum
UNION DISTINCT
SELECT DISTINCT MetricName FROM otel_metrics_histogram
ORDER BY MetricName
```

### 查看某个指标有哪些标签维度

```sql
SELECT DISTINCT arrayJoin(mapKeys(Attributes)) as key
FROM otel_metrics_gauge
WHERE MetricName = 'edge_http_requests_total'
```

### 查看指标类型（Counter / Gauge）

```sql
SELECT
    MetricName,
    IsMonotonic,
    AggregationTemporality,
    count(*) as cnt
FROM otel_metrics_sum
GROUP BY MetricName, IsMonotonic, AggregationTemporality
```

### 查看各表数据量

```sql
SELECT 'otel_metrics_gauge' as table_name, count(*) as cnt FROM otel_metrics_gauge
UNION ALL
SELECT 'otel_metrics_sum', count(*) FROM otel_metrics_sum
UNION ALL
SELECT 'otel_metrics_histogram', count(*) FROM otel_metrics_histogram
UNION ALL
SELECT 'otel_metrics_exponential_histogram', count(*) FROM otel_metrics_exponential_histogram
```

---

## 新增 API 端点（v1.1）

以下 API 端点已在 `backend/app/api/v1/metrics.py` 中实现，供前端和外部系统调用。

### 1. 路由统计 API

**端点**: `GET /api/v1/metrics/route-stats`

**参数**:

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `stats_type` | string | `qps` | 统计类型：`qps` / `bandwidth` / `error_rate` / `latency` |
| `since` | string | `24h` | 时间范围（如 `1h`, `6h`, `24h`, `7d`） |
| `limit` | int | `10` | 返回条数（1-100） |
| `latency_type` | string | `request` | 延迟类型（仅 latency 时生效）：`request` / `connect` |

**响应示例**:

```json
{
  "data": [
    { "route_id": "/api/users", "value": 125.5 },
    { "route_id": "/api/orders", "value": 89.2 }
  ]
}
```

**数据来源**:
- `qps`: `otel_metrics_sum` 表 `edge_http_status` 指标
- `bandwidth`: `otel_metrics_sum` 表 `edge_bandwidth` 指标
- `error_rate`: `otel_metrics_sum` 表 `edge_http_status` 指标（4xx + 5xx）
- `latency`: `otel_metrics_histogram` 表 `edge_http_latency` 指标

### 2. 状态码分析 API

**端点**: `GET /api/v1/metrics/status-analysis`

**参数**:

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `since` | string | `24h` | 时间范围 |

**响应示例**:

```json
{
  "data": [
    { "status_class": "2xx", "request_count": 12500, "percentage": 85.5 },
    { "status_class": "4xx", "request_count": 1500, "percentage": 10.2 },
    { "status_class": "5xx", "request_count": 500, "percentage": 3.4 },
    { "status_class": "其他", "request_count": 130, "percentage": 0.9 }
  ]
}
```

**状态分类逻辑**:
- `2xx`: code 以 2 开头
- `3xx`: code 以 3 开头
- `4xx`: code 以 4 开头
- `5xx`: code 以 5 开头
- `其他`: 不属于以上分类

### 3. 时间对比 API

**端点**: `GET /api/v1/metrics/time-comparison`

**参数**:

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `comparison_type` | string | `day_over_day` | 对比类型：`day_over_day` / `hourly_distribution` / `week_over_week` |
| `days` | int | `7` | 历史天数（hourly_distribution 时生效） |

**响应示例 (day_over_day)**:

```json
{
  "data": {
    "today_requests": 12500,
    "yesterday_requests": 11800,
    "change_rate": 5.93,
    "data_quality": "complete",
    "today_sample_count": 1440,
    "yesterday_sample_count": 1440
  }
}
```

**响应示例 (hourly_distribution)**:

```json
{
  "data": [
    { "hour_of_day": 0, "day_of_week": 1, "request_count": 500 },
    { "hour_of_day": 1, "day_of_week": 1, "request_count": 350 }
  ]
}
```

**data_quality 判定**:
- `complete`: 样本数 ≥ 预期数 × 90%
- `partial`: 样本数 < 预期数 × 90%

### 4. 节点健康 API

**端点**: `GET /api/v1/metrics/node-health`

**参数**:

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `health_type` | string | `status` | 查询类型：`status` / `resource` |
| `status` | string | `null` | 过滤状态：`healthy` / `unhealthy`（仅 status 类型时生效） |

**响应示例 (status)**:

```json
{
  "data": [
    { "node_ip": "192.168.100.42", "status": 1, "last_seen": "2026-08-21 10:47:42" }
  ]
}
```

**响应示例 (resource)**:

```json
{
  "data": [
    {
      "dict_name": "shared_dict",
      "node_ip": "192.168.100.42",
      "capacity_bytes": 104857600,
      "free_bytes": 52428800,
      "usage_percent": 50.0
    }
  ]
}
```

**数据来源**:
- `status`: `otel_metrics_gauge` 表 `up` 指标
- `resource`: `otel_metrics_gauge` 表 `edge_shared_dict_capacity_bytes` 和 `edge_shared_dict_free_space_bytes` 指标
