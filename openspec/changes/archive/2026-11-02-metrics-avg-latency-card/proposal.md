# metrics-avg-latency-card 提案

## Why

指标总览覆盖了流量（QPS）与连接状态，但缺少请求性能维度——「请求平均处理时间」是 Golden Signals 中的 latency，排查网关慢/上游慢时是仅次于 QPS 的第一观察点。数据侧实测就绪：`edge_http_latency` @ `otel_metrics_histogram`（`latency_type=request`）已有 10.5 万行实时数据，`Attributes['ip']` 可接入既有集群筛选。

## What Changes

- 核心流量区新增「平均耗时」卡：全站请求平均处理耗时 sparkline，单位 ms，口径为**窗口增量 ΔSum/ΔCount**（统计窗口内被处理请求的平均耗时；与 QPS 卡增量语义同构，天然防计数器重启）。
- 布局调整（用户裁决 A）：核心流量第一行 QPS + 平均耗时双卡并列，第二行 Nginx 连接状态全宽（span 2，4 状态序列横向舒展）——无空网格格。
- 后端新增 histogram 专用查询 `query_avg_latency_series` + 端点 `GET /metrics/avg-latency`（since/interval/filter 全参数），filter 接入既有集群筛选体系。
- 不做：P95/P99 分位卡（桶数据 `ExplicitBounds`/`BucketCounts` 已存储，留 P2 备忘）；路由统计-延迟视图的口径改造（其累计平均是按路由排名的既有语义，不随本次变更）。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `metrics-dashboard`：
  - MODIFIED「Dashboard page layout」——核心流量区布局（第一行 QPS + 平均耗时，第二行连接状态全宽）与业务指标定义（平均耗时卡）。
  - ADDED「Average request latency card」——数据源、增量口径、单位、空态语义、筛选接入。

## Impact

- Affected specs: `metrics-dashboard`（1 MODIFIED + 1 ADDED）
- Affected code:
  - backend: `app/services/metrics_service.py`（`query_avg_latency_series`）、`app/api/v1/metrics.py`（`GET /metrics/avg-latency`）、`backend/tests/test_avg_latency.py`（新）+ `test_metrics_cluster_filter.py`（补端点断言）
  - frontend: `src/api/metrics.ts`、`src/stores/metricsDashboard.ts`（ChartDefinition 加 `kind`，loadSingleChart 按 kind 路由）、`src/views/MetricsDashboard.vue`（布局 A + 新卡）、组件/视图/store 测试
  - docs: 用户手册 16-01 重生成（核心流量布局变化）
- Dependencies: 无新依赖
