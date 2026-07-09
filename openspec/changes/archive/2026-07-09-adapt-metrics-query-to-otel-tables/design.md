## Context

指标查询（`/metrics`）和指标总览（`/metrics/dashboard`）功能依赖 ClickHouse 数据库 `esapm_metrics` 中的指标数据。此前使用的 OTel v2 schema（`samples_v2` + `time_series_v2`）已被标准 OTel schema 取代，新表为 `otel_metrics_gauge`、`otel_metrics_sum` 等。

当前代码（`metrics_service.py`）中所有 SQL 查询都硬编码了旧的表名和列名，需要在不动 API 接口的前提下，将查询迁移到新表。

### 新旧表结构对比

| 维度 | 旧表（v2） | 新表（OTel） |
|---|---|---|
| 表名 | `samples_v2` | `otel_metrics_gauge` / `otel_metrics_sum` |
| 表名 | `time_series_v2` | 已废弃（Attributes 内联到数据行） |
| 指标名列 | `metric_name` | `MetricName` |
| 值列 | `value` (Float64) | `Value` (Float64) |
| 时间列 | `timestamp_ms` (Int64, ms) | `TimeUnix` (DateTime64(9), ns) |
| 标签 | `time_series_v2.labels` (JSON 字符串, 需 JOIN) | `Attributes` (Map(String, String), 内联) |
| 类型检测 | `temporality` = `'Cumulative'` | `IsMonotonic` + `AggregationTemporality` (Sum 表) |

### 实际数据分布

| 表 | 包含的指标 |
|---|---|
| `otel_metrics_gauge` | `edge_http_requests_total`, `edge_nginx_http_current_connections`, `edge_shared_dict_capacity_bytes`, `edge_shared_dict_free_space_bytes`, `scrape_duration_seconds`, `scrape_samples_scraped`, `scrape_series_added`, `scrape_samples_post_metric_relabeling`, `up` |
| `otel_metrics_sum` | `edge_metric_errors_total` |

## Goals / Non-Goals

**Goals:**
- 全部 3 个 API 端点（`/metrics/names`, `/{name}`, `/summary`）在新表上正确返回数据
- Counter 指标（含 `_total` 后缀的 Gauge 表指标 和 Sum 表指标）正确算 rate
- Gauge 指标返回 avg/max/min 值
- 标签过滤（如 `state:active`）使用新 Map 语法
- 前端指标名同步更新
- 已有的 29 个测试全部通过

**Non-Goals:**
- 不改动 API 接口签名和返回格式
- 不涉及 `otel_metrics_histogram`/`otel_metrics_summary`/`otel_metrics_exponential_histogram`（当前无数据）
- 不重构 `clickhouse_client.py` 连接管理
- 不修改 docs/monitor/datart-metrics-sql.md（Datart 独立系统）

## Decisions

### 1. Counter 检测策略
- **选择**：双阶段检测 — 先查 `otel_metrics_sum.IsMonotonic=1 AND AggregationTemporality=2`（OTel 原生累计 Counter），再以 `_total` 后缀回退
- **理由**：新 schema 中 `edge_http_requests_total` 存储在 Gauge 表（尽管是累计值），Prometheus `_total` 约定是最可靠的回退手段
- **备选**：仅检查 Sum 表 → `_total` 后缀的 Gauge 指标不会算 rate → 数据错误

### 2. 标签过滤语法
- **选择**：ClickHouse Map 下标语法 `Attributes['key'] = 'val'`
- **理由**：新 schema 的 `Attributes` 是 `Map(LowCardinality(String), String)`，不需要 JOIN
- **备选**：`JSONExtractString(Attributes, 'key')` — 但 Attributes 已是原生 Map 类型，JSON 函数无效

### 3. Summary 查询策略
- **选择**：UNION ALL 两表的 `argMax(Value, TimeUnix)`
- **理由**：指标分布在不同表中，需要合并后再聚合
- **备选**：分别查两表再 Python 侧 merge → 额外代码，无性能优势

### 4. 时间过滤语法
- **选择**：`TimeUnix > now() - INTERVAL %(since)s SECOND`
- **理由**：`TimeUnix` 是 DateTime64(9) 原生类型，可直接与 `now()` 比较
- **备选**：先 `toUnixTimestamp(TimeUnix)` 再比较整数 → 多余转换，影响索引利用

## Risks / Trade-offs

| 风险 | 缓解措施 |
|---|---|
| **`_total` 后缀回退可能失效**：未来出现 `*_total` 结尾的非累计指标 | 当前所有 `_total` 指标都是 Prometheus Counter，暂无例外；可后续增加白名单机制 |
| **otel_metrics_histogram 后续有数据**：当前为空，但未来可能填充 | `query_metric_names()` 的 UNION 会自动包含；`query_time_series()` 需要后续扩展 |
| **前端的 `edge_metric_errors` 引用**：页面和 store 中硬编码了旧名 | 已全部更新为 `edge_metric_errors_total` |
