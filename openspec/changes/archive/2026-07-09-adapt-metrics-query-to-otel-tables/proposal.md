## Why

统计系统从旧 OTel v2 schema（`samples_v2` + `time_series_v2`）升级为标准 OpenTelemetry schema（`otel_metrics_gauge` + `otel_metrics_sum` + `otel_metrics_histogram` 等）。现有指标查询代码仍引用已不存在的旧表名，导致查询失败。需要将后端 SQL 查询适配到新表结构和列名，确保指标查询（`/metrics`）和指标总览（`/metrics/dashboard`）功能正常运行。

## What Changes

- **后端 metrics_service.py**：重写全部 ClickHouse SQL 查询，使用新 OTel 表名和列名
  - `query_metric_names()` — 改为从 `otel_metrics_gauge` 和 `otel_metrics_sum` UNION 查询
  - `_is_counter()` — 改为检测 `otel_metrics_sum.IsMonotonic` + `AggregationTemporality`，保留 `_total` 后缀回退
  - `query_time_series()` — 三路查询：Sum counter / Gauge counter（_total）/ Pure gauge
  - `query_summary()` — UNION ALL 两表的最新值聚合
  - 标签过滤从 `JSONExtractString(t.labels, 'key')` 改为 `Attributes['key']` 语法
  - 时间过滤从 `timestamp_ms` 毫秒改为 `TimeUnix` DateTime64 原生类型
- **前端指标名称同步**：`edge_metric_errors` → `edge_metric_errors_total`，`scrape_duration` → `scrape_duration_seconds`
- **删除了旧的 `time_series_v2` JOIN 模式**：新 schema 中 `Attributes` Map 列直接内联在数据行中
- 无 API 接口变更（保持 `GET /api/v1/metrics/*` 兼容）

## Capabilities

### New Capabilities

无新增能力

### Modified Capabilities

- `clickhouse-metrics-query`: 查询数据源从 `esapm_metrics.samples_v2` / `time_series_v2` 迁移到 `otel_metrics_gauge` / `otel_metrics_sum`；Counter/Gauge 检测逻辑从 `temporality` 列改为 `IsMonotonic` + `AggregationTemporality`
- `metrics-dashboard`: 指标名称 `edge_metric_errors` 变更为 `edge_metric_errors_total`，`scrape_duration` 变更为 `scrape_duration_seconds`

## Impact

| 影响范围 | 文件 | 改动类型 |
|---|---|---|
| 后端查询服务 | `backend/app/services/metrics_service.py` | 全部 SQL 重写 |
| 后端单元测试 | `backend/tests/test_metrics_service.py` | Mock 和断言更新 |
| 前端仪表盘 Store | `frontend/src/stores/metricsDashboard.ts` | 指标名修正 |
| 前端指标查询页面 | `frontend/src/views/Metrics.vue` | 指标名和标签修正 |
