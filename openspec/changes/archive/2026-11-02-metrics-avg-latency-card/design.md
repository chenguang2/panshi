# metrics-avg-latency-card 设计

## Context

两项用户裁决（2026-11-02）：① 布局 A——核心流量第一行 QPS + 平均耗时双卡，第二行连接状态全宽；② 增量口径 ΔSum/ΔCount（窗口内请求平均耗时，非累计比值）。

实测依据（2026-11-02 ClickHouse）：
- `edge_http_latency` @ `otel_metrics_histogram`：5 种 latency_type（request/upstream/edge/client_send/client_recv）各 105,329 行，实时覆盖；`AggregationTemporality=2`（cumulative）；`Attributes` 含 ip/node/route/type；`Attributes['ip']` 可接入集群筛选。
- 字段：`Sum` (Float64 累计耗时和)、`Count` (UInt64 累计请求数)、`Min`/`Max`（**采集端未填，恒 0，不可用**）、`ExplicitBounds`/`BucketCounts`（桶数组，P95/P99 后续可选）。
- 增量口径实测：09 时 +1,341,006 请求 avg 0.823ms；10 时 +1,596,952 avg 1.011ms；无流量时段增量=0。
- `MetricUnit` 为空串——单位约定与路由统计-延迟视图（`avg_latency_ms`）一致，直接输出 ms。

## Goals / Non-Goals

**Goals**：总览页可观察全站请求平均处理耗时趋势；接入既有刷新/筛选/三态机体系；口径诚实（窗口增量 + 口径标注）。
**Non-Goals**：P95/P99 分位卡；路由统计-延迟视图口径改造；按 latency_type 切换器（`request` 固定，语义即「完整请求处理时间」）。

## Decisions

### D1 口径：窗口增量 ΔSum/ΔCount（用户裁决）

每桶 `sum(s_last - prev_s) / sum(c_last - prev_c)`，`lagInFrame(x,1,x)` 默认值取自身（首桶增量为 0，与 QPS 卡一致）；负增量（计数器重启）钳 0；`c_inc > 0` 才计算（无请求的桶 avg=0.0，sparkline 连续、头部显示 0.0 ms——事实语义「窗口内没有请求被处理」）；完全无行 → 既有空态「暂无上报数据」。

与路由统计-延迟视图（`avg(Sum/Count)` 累计比值）数值不同属**预期**：该视图是按路由的自启动累计平均排名，总览卡是全站窗口趋势；卡片口径标注「近 {time range}」已说明窗口语义。

### D2 专用函数而非通用化 query_time_series

`query_time_series` 的两路径（counter rate / gauge agg）语义已清晰，histogram 的 avg（Sum/Count 比值）语义特异——新增专用 `query_avg_latency_series(metric_name, since, interval, latency_type='request', ips=None)` 返回同构 `{timestamp, avg, sample_count, metric_name}`，端点独立 `GET /metrics/avg-latency`。避免为单卡把通用函数改造成三态路由。

### D3 store 路由：ChartDefinition 加 `kind` 字段

`{ key: 'avg_latency', label: '平均耗时', metricName: 'edge_http_latency', unit: 'ms', kind: 'histogram_avg' }` 进 BUSINESS_CHARTS；`loadSingleChart` 按 `cd.kind === 'histogram_avg'` 调 `getAvgLatencySeries(cd.metricName, timeRange, interval, filter)`，否则走既有 `getMetricTimeSeries`。时间范围变化/手动刷新/自动刷新/单卡重试/集群筛选全部经由既有编排自动生效，零特判扩散。

### D4 视图布局（用户裁决 A）

核心流量 section：第一行 QPS + 平均耗时（2 列网格），第二行 Nginx 连接状态 `grid-column: 1 / -1` 全宽。spec 的「无空网格格」条款保持成立。

### D5 筛选与刷新接入（一致性，AGENTS #51 意识）

新卡必须完整接入既有体系：filter prop → `filterParam`；refreshTick；retryChart('avg_latency')；loading/error/empty 三态机；scope 标注「近 {time range}」（MetricChartCard 既有能力，传 unitLabel 无需新增）。错误归因按数据源状态（sourceOk）走既有 metricCardError 路径。

## 文案对照表

| # | 位置 | 最终文案 |
|---|---|---|
| 1 | 卡标题 | 平均耗时 |
| 2 | 口径标注 | 近 {time range}（既有 scope 标注复用） |
| 3 | 值单位 | ms（chart-unit 位置） |
| 4 | 空态（有样本无增量） | 数值显示 0.0 ms（非空态文案） |
| 5 | 空态（无行） | 暂无上报数据 |
| 6 | 错误态 | 数据源不可用，无法读取指标 / 加载失败 ＋ 重试（既有归因复用） |

## Risks / Trade-offs

- **首桶语义**：lagInFrame 默认自身 → 首桶增量恒 0——1h 窗口最左点显示 0.0ms 会被误读为「很快」？QPS 卡同构行为已存在（首点 0.0/s），视觉上是 sparkline 左端一个点，可接受；如困扰可后续把首桶点置 null（前端跳过）——本次不做，与 QPS 保持一致。
- **单位歧义**：MetricUnit 为空，ms 是约定（对齐 route-stats latency 视图既有输出）——若真实采集单位不是 ms，两处会一起错，属于采集端契约问题，越出本卡范围（实机对照 0.8–1.0ms 量级与压测场景合理）。
- **histogram 表大窗口查询成本**：7d 窗口 interval 1h → 桶数少、子查询按 Attributes 分组聚合量可控；与 route-stats latency 同表同型查询，已有先例。

## Open Questions

无阻塞项。
