# metrics-fast-ratio-card 提案

## Why

指标总览的时延维度目前只有「平均耗时」一张卡，看不出尾部。原 P2 备忘的「P95/P99 分位卡」经实测证伪：`edge_http_latency` 的桶边界为 `[10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]` ms，近 1h 窗口 **99.96% 的请求落在首个桶 `(0, 10]`**（ΔCount 2,204,476，ΔSum 1,929,198 → 平均仅 0.875 ms）。任何桶内插值都被桶宽支配：Prometheus 式线性插值给出 P50 = 5.00 ms、P95 = 9.50 ms、P99 = 9.90 ms——**P50 比真实均值大 5.7 倍，P95/P99 只差 0.4 ms**，上线即被误读为数据缺陷。`edge_http_latency_max`（进程累计最大，实测 22 → 60 后 5 小时恒定）与 `_min`（恒 0）同样不可用，`otel_metrics_exponential_histogram` 为 0 行。

结论（用户裁决 2026-11-02）：**不做插值分位，改用桶增量的精确占比**——「快速响应占比」= ΣΔ(≤首桶边界 的请求数) / ΣΔ(请求总数)。数字是数出来的而非插出来的，网关/上游变慢时它会明显下落，具备观测价值。

## What Changes

- 核心流量区新增「快速响应占比」卡：全站请求中「处理耗时 ≤ 阈值」的占比（%），sparkline 趋势 + 头部最新值；口径为**窗口增量精确占比** `ΣΔBucketCounts[1] / ΣΔCount`，**不做任何桶内插值**。
- 阈值**动态取自数据**（`ExplicitBounds[1]`，当前 10 ms），不硬编码：Edge 侧桶边界若变更，卡片标注与数值自动跟随。
- 布局调整（用户裁决：核心流量 3 列）：第一行 `QPS | 平均耗时 | 快速响应占比` 三卡并列（`core-grid` 3 列），第二行 Nginx 连接状态仍全宽——保持「无空网格格」。
- 后端新增 histogram 占比查询 `query_fast_ratio_series` + 端点 `GET /metrics/fast-ratio`（since/interval/filter 全参数，响应附 `threshold_ms`）。
- 新增「耗时区间分布」展示（用户裁决 2026-11-03，纳入原「另行评估」项）：呈现**各桶区间自身**的精确占比与计数（如 `10–20ms 0.03%`，悬停见 `624 次`），可读出任意单桶区间（如 10 < 耗时 ≤ 20 ms）占窗口总请求的比例，与「≤ 阈值」累计口径互补。`GET /metrics/fast-ratio` 响应追加 `bucket_stats` 兄弟字段（`{bounds, ratios, counts, total} | null`，窗口聚合、非时间序列），不新增端点。
- 不做：P95/P99 插值分位卡（实测不支持，见 Why，备忘结论归档进 design）；采集端桶边界细化（Edge 产品侧，本仓库无控制点）；区间分布的**时间序列形态**（11 条曲线不可读，窗口聚合已满足「读单桶占比」诉求）。（原不做项「延迟分布条形卡另行评估」已于 2026-11-03 经用户裁决以区间 chip 分布形式纳入本变更，见 design D10。）

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `metrics-dashboard`：
  - MODIFIED「Dashboard page layout」——核心流量区布局（第一行三卡 3 列 + 行下区间分布条，第二行连接状态全宽）与业务指标定义（快速响应占比卡）。
  - ADDED「Fast response ratio card」——数据源、精确占比口径、动态阈值、空态语义、筛选接入、格式、耗时区间分布。

## Impact

- Affected specs: `metrics-dashboard`（1 MODIFIED + 1 ADDED）
- Affected code:
  - backend: `app/services/metrics_service.py`（`query_fast_ratio_series` + `query_fast_ratio_bucket_stats`）、`app/api/v1/metrics.py`（`GET /metrics/fast-ratio` 响应追加 `bucket_stats`）、`backend/tests/test_fast_ratio.py`（新）+ `test_metrics_cluster_filter.py`（补端点断言）
  - frontend: `src/api/metrics.ts`（`getFastRatioSeries` + `FastRatioBucketStats` 类型）、`src/stores/metricsDashboard.ts`（`kind: 'histogram_ratio'` + 阈值 ref + `fastRatioBuckets` 状态）、`src/views/MetricsDashboard.vue`（core-grid 3 列 + 新卡 + 行下区间分布条）、`src/components/MetricChartCard.vue`（`%` 数值格式化分支）、`src/components/LatencyBucketDistribution.vue`（新，区间分布 chips）
  - 测试：`backend/tests/test_fast_ratio.py`、`test_metrics_cluster_filter.py`、`src/stores/__tests__/metricsDashboard.test.ts`、`src/api/__tests__/metrics.test.ts`、`src/views/__tests__/MetricsDashboard.test.ts`、`src/components/__tests__/MetricChartCard.test.ts`、`src/components/__tests__/LatencyBucketDistribution.test.ts`（新）
  - docs: 用户手册 16-01 截图重生成（核心流量布局变化）
- Dependencies: 无新依赖；**不触 schema / 迁移 / 写库路径 → PG 方言冒烟不强制**（AGENTS #31）
