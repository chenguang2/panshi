# metrics-avg-latency-card 任务清单

> 约定：TDD（RED 验证失败原因再 GREEN）；mock 形状取自真实响应（AGENTS #43）；新卡必须完整接入既有 filter/刷新/三态机体系（AGENTS #51 意识、#217 断言反转清单）；无 schema/写库路径改动，PG 冒烟不强制；实机验收 test 集群 + 手册截图重生成。

## 1. 后端（design D1/D2/D5）
- [x] 1.1 RED：`tests/test_avg_latency.py`——`query_avg_latency_series` SQL 形态（histogram 表 / type=request / ip IN / lagInFrame 差分嵌套 / 负增量钳 0）、返回同构 `{timestamp, avg, sample_count, metric_name}`、`latency_type`/`ips` 参数化；`GET /metrics/avg-latency` 端点接线（since/interval/filter/400 中文）
- [x] 1.2 实现 `query_avg_latency_series` + 端点；GREEN
- [x] 1.3 `tests/test_metrics_cluster_filter.py` 补 avg-latency 端点 filter 断言；域回归 `-k "metrics or node_health"` 全绿

## 2. 前端（design D3/D4）
- [x] 2.1 消费方普查：BUSINESS_CHARTS/loadSingleChart/allLoadTargets/retryChart/MetricsDashboard 核心流量断言清单（#217 前置）
- [x] 2.2 RED（store）：`kind: 'histogram_avg'` 目标定义、loadSingleChart 按 kind 路由调 `getAvgLatencySeries`（带 filter）、retryChart('avg_latency') 生效；GREEN
- [x] 2.3 RED（api）：`getAvgLatencySeries(since, interval, filter?)` 参数透传；实现
- [x] 2.4 RED（视图）：核心流量区含平均耗时卡（unit=ms）+ 连接状态卡全宽 class 断言 + 既有断言反转清单；GREEN
- [x] 2.5 视图布局 A（第一行 QPS+平均耗时，第二行连接状态 span 全宽）；span-full 样式

## 3. 收口与实机验收
- [x] 3.1 前端全量 `npx vitest run --no-file-parallelism` + `npx vue-tsc -b`；后端域回归
- [x] 3.2 实机验收（test 集群）：① 默认视角平均耗时卡渲染（sparkline + 头部 ms 值 + 口径标注）；② 布局 A（无空格、连接状态全宽）；③ 时间范围切换（1h/24h 值变化）；④ 集群/节点筛选后数值收窄；⑤ 无流量时段显示 0.0 ms 非空态；⑥ 手册 16-01 重生成
- [x] 3.3 用户验收确认
