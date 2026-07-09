## 1. 后端 — 查询服务迁移

- [x] 1.1 重写 `_is_counter()`：改为检测 `otel_metrics_sum.IsMonotonic=1 AND AggregationTemporality=2`，保留 `_total` 后缀回退
- [x] 1.2 重写 `query_metric_names()`：UNION DISTINCT 从 `otel_metrics_gauge` 和 `otel_metrics_sum` 查询
- [x] 1.3 重写 `query_time_series()` Counter 路径：Sum 表 counter 和 Gauge 表 counter（`_total`）均算 rate
- [x] 1.4 重写 `query_time_series()` Gauge 路径：从 `otel_metrics_gauge` 查询 avg/max/min
- [x] 1.5 重写 `query_summary()`：UNION ALL 两表后 `argMax(Value, TimeUnix)` 聚合
- [x] 1.6 标签过滤改为 `Attributes['key']` Map 语法，移除 `time_series_v2` JOIN

## 2. 后端 — 单元测试更新

- [x] 2.1 更新 `test_time_series_gauge` mock：`_is_counter` 新检测逻辑（Sum 表查不到 + 无 `_total`）
- [x] 2.2 更新 `test_time_series_counter` mock：`_is_counter` 通过 `_total` 后缀检测
- [x] 2.3 新增 `test_time_series_counter_from_sum`：验证 Sum 表 counter 路径
- [x] 2.4 更新 `test_time_series_with_label` 断言：从 `JSONExtractString` 改为 `Attributes['state']`
- [x] 2.5 更新 `test_time_series_negative_rate_clamped`、`test_time_series_no_data` 等 mock

## 3. 前端 — 指标名称同步

- [x] 3.1 `stores/metricsDashboard.ts`：`edge_metric_errors` → `edge_metric_errors_total`，`scrape_duration` → `scrape_duration_seconds`
- [x] 3.2 `views/Metrics.vue`：`BUSINESS_METRICS` 和 `METRIC_LABELS` 同步更新

## 4. 验证

- [x] 4.1 端到端验证 3 个 API 端点返回正确数据（names / {name} / summary）
- [x] 4.2 验证 Counter rate 计算正确（`edge_http_requests_total`、`edge_metric_errors_total`）
- [x] 4.3 验证 Gauge 查询正确（`edge_nginx_http_current_connections?label=state:active`）
- [x] 4.4 运行全部 29 个测试通过
