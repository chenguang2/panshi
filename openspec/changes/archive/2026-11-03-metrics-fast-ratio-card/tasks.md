# metrics-fast-ratio-card 任务清单

> 约定：TDD（RED 验证失败原因再 GREEN）；mock 形状取自真实响应（AGENTS #43）；新卡必须完整接入既有 filter/刷新/三态机体系（AGENTS #51 意识、#217 断言反转清单）；无 schema/写库路径改动，PG 冒烟不强制；实机验收 test 集群 + 手册 16-01 截图重生成。

## 0. 前置：消费方普查（#217，改共享卡组件前必做）
- [x] 0.1 列出 `MetricChartCard` 全部消费方（QPS/平均耗时/连接状态/采集错误率/基础设施 6 卡/延迟相关），标出会被 `%` 格式化分支与 `scopeLabel` 影响的断言；产出"既有断言是否需要反转"清单（预期：不反转，仅新增 `%` 用例）→ 实测既有断言无一反转；新增 `header-extra` 插槽为可选，无插槽时不渲染容器（已加用例钉住）
- [x] 0.2 `core-grid` 为 MetricsDashboard 内新增类，确认不影响其他 section 的 `.chart-grid` 2 列与 `@media (max-width: 800px)` 单列行为

## 1. 后端（design D1/D2/D3/D4）
- [x] 1.1 RED：`tests/test_fast_ratio.py`——`query_fast_ratio_series` 断言 SQL 形态（histogram 表 / `type=request` / `ip IN` 透视 / 取 `BucketCounts[i]` 与 `Count` / lagInFrame 差分嵌套 / 负增量钳 0 / 跨序列求和后相除）、返回 `{"points", "threshold_ms", "bounds"}`、`latency_type`/`threshold_ms`/`ips` 参数化、`ΔCount=0` 桶不出点、`threshold_ms` 回退 10.0
- [x] 1.2 实现 `query_fast_ratio_series` + `query_latency_bounds`；GREEN（14 passed）
- [x] 1.3 RED：`GET /metrics/fast-ratio` 端点（since/interval/filter/threshold_ms 校验 + 400 中文、响应信封 `{data, threshold_ms, bounds, warning?}`）
- [x] 1.4 端点实现；GREEN
- [x] 1.5 `tests/test_metrics_cluster_filter.py` 补 fast-ratio filter 断言（边界查询 + 主查询各带 ips）；`tests/test_security_guard.py` 补匿名 401 与权限 403 采样；域回归 `-k "metrics or fast_ratio or security_guard"` → 172 passed
- [x] 1.6 实机数值复核：1h 窗口 `threshold_ms=10.0`、头部占比 99.89–99.98%（与手算 `BucketCounts[1]/Count` 一致）；非法阈值 30 返回 400 中文；7d/1h 正常
- [x] 1.7 差分补 `PARTITION BY Attributes`（多节点/多序列时无此分区会把别的序列当上一个点，占比失真）——已加 SQL 守卫断言

## 2. 前端（design D5/D6/D7/D8）
- [x] 2.1 RED（api）：`getFastRatioSeries(since, interval, filter?, thresholdMs?)` 参数透传、解包 `{points, thresholdMs}`、`threshold_ms` 缺省回退 10、`bounds` 缺省 `[]`
- [x] 2.2 RED（store）：`BUSINESS_CHARTS` 新增 `{ key: 'fast_ratio', unit: '%', kind: 'histogram_ratio' }`；`loadSingleChart` 按 kind 路由并写入 `fastRatioThresholdMs`/`fastRatioBounds`；`setFastRatioThreshold` 只重发该卡（同值不请求）
- [x] 2.3 实现 api + store；GREEN（store 19 passed）
- [x] 2.4 RED（组件）：`unit='%'` 固定两位小数、`header-extra` 插槽渲染/缺省不渲染、单点显形、多点无符号；GREEN（17 passed）
- [x] 2.5 RED（视图）：核心流量 4 卡（3 卡并排 + 连接状态 `span-full`）、阈值下拉选项来自 bounds、切换只重发占比卡；GREEN
- [x] 2.6 视图实现：`core-grid` 3 列 + 中宽屏（801–1180px）2 列 + 占比卡整行 + 阈值下拉（`handleThresholdChange`）
- [x] 2.7 实机视觉修正：单点不出图 → `showSymbol: data.length === 1`；窄卡「99.93 / %」折行 → `.chart-number` nowrap

## 3. 收口与实机验收
- [x] 3.1 前端全量 `npx vitest run --no-file-parallelism`（memory #208）+ `npx vue-tsc -b`（#27）；后端域回归
- [x] 3.2 实机验收（Playwright + 1440/1280/1000/820 四档）：① 三卡并排 + 连接状态全宽，无空格；② 头部值 + 阈值下拉；③ 下拉选项 = 10 档桶边界；④ 切换 100ms 只重发该卡；⑤ 无流量时段空态「暂无上报数据」（D3 正确行为）；⑥ 单点显形；⑦ 无 console 错误
- [x] 3.3 手册 16-01 截图重生成（`node scripts/manual-screenshots.mjs --only 16-01-dashboard`，--only 为精确匹配）——2026-11-03 完成：采集端有真实数据（total 1,011,684），分布条/五卡/四分区齐全无空态；随版面同步更新 24-metrics.md 24.3.2 业务图表表（补平均耗时/快速响应占比两行 + 耗时区间分布说明）与 24.6 小结
- [x] 3.4 用户验收确认（2026-11-03：用户实测提出头部/分布一致性反馈 → D13 修复复验一致后指示「同步并归档」＝验收通过）

## 4. 耗时区间分布扩展（2026-11-03 用户裁决，design D9–D12）

> 口径与 D1 同源（argMax → lagInFrame 逐元素差分 → 钳 0 → 跨序列求和全继承）；零插值不变；窗口聚合非时间序列；无 schema/写库路径改动，PG 冒烟不强制；位置 = 用户裁决 B（行下全宽条），不改共享卡组件。

### 4.1 后端（D9）
- [x] 4.1 RED：`tests/test_fast_ratio.py` 补 `query_fast_ratio_bucket_stats`——SQL 形态守卫（argMax(BucketCounts) 数组 / lagInFrame 逐元素差分 PARTITION BY Attributes / 负增量钳 0 / ARRAY JOIN 透视 / GROUP BY idx 跨序列求和 / 除以 ΔCount）；返回 `{bounds, ratios, counts, total}`；ratios/counts 长度 = len(bounds)+1（含溢出桶）；2dp 舍入；`total ≤ 0 → bucket_stats=null`
- [x] 4.2 实现 `query_fast_ratio_bucket_stats`；`GET /metrics/fast-ratio` 响应追加 `bucket_stats` 兄弟字段（无新路由 → security_guard 采样不变）；GREEN
- [x] 4.3 `tests/test_metrics_cluster_filter.py` 补 bucket_stats 随 filter 透传断言；域回归 `-k "metrics or fast_ratio or security_guard"` → 187 passed

### 4.2 前端（D10/D11/D12）
- [x] 4.4 RED（api）：`FastRatioBucketStats` 类型（`{bounds, ratios, counts, total}`）+ `getFastRatioSeries` 解包 `bucket_stats → bucketStats`（缺省 null）；GREEN
- [x] 4.5 RED（store）：`fastRatioBuckets` 状态——随 `loadSingleChart('fast_ratio')` 写入、失败/空置 null、`setFastRatioThreshold` 重发幂等（分布不随阈值变化）；GREEN
- [x] 4.6 RED（组件）：新 `LatencyBucketDistribution.vue`——全 N+1 桶无条件渲染、0.00% 置灰、label 格式（`≤10ms` / `10–20ms` / `>10000ms`，与阈值下拉同款 `${b}ms` 去尾零）、悬停 `{label}：{count} 次（{pct}%）`、口径提示（左开右闭 + 窗口总量）、空数据不渲染；GREEN
- [x] 4.7 RED（视图）：MetricsDashboard 在 core-grid 行下渲染全宽分布条（D11-B，不改 MetricChartCard），数据驱动显隐（`fastRatioBuckets == null` → 整块不渲染）；GREEN
- [x] 4.8 实机交叉验证：`ratios[0]=99.98` 与头部累计占比同源一致（1h 窗口 total=1,011,684；真实分布 1,011,482 / 196 / 6 / 0×8）；1440/1280/1000/820 四档 wrap 不溢出（scrollW ≤ parentW）、chips=11、无 console 错误；截图 `/tmp/opencode/bucket-strip-*.png`

### 4.3 收口
- [x] 4.9 前端全量 `npx vitest run --no-file-parallelism`（#208）→ 2483 passed + `npx vue-tsc -b` → 0 error；后端域回归 `-k "metrics or fast_ratio or security_guard"` → 187 passed
- [x] 4.10 手册 16-01 截图重生成（**与 3.3 合并**，2026-11-03 完成）；用户验收确认（与 3.4 合并，2026-11-03 随归档指令确认）

## 5. 头部口径对齐窗口聚合（2026-11-03 用户反馈「头部 100.00% vs 分布条 99.98%」，design D13）

> 用户裁决：头部与分布条必须一致。头部改为窗口聚合占比 `window_ratio = ΣΔ前 k 桶 / ΣΔCount`，与分布条同源；D3「头部取最近一桶」废止；平均耗时卡同型问题不动（待用户裁决）。

- [x] 5.1 RED：`tests/test_fast_ratio.py` 补 `window_ratio`——series 全窗口聚合（Σf/Σc 单次舍入）、无数据 null、端点信封透传；GREEN（域回归 190 passed）
- [x] 5.2 #217 消费方普查：`MetricChartCard` 仅 MetricsDashboard 消费；`headValue` 为可选 prop（null/缺省走原 `latestValue`），既有头部值用例零反转，新增 override/null 回落两用例
- [x] 5.3 RED（前端）：api `windowRatio` 解包（缺省 null）、store `fastRatioWindowRatio`（失败置 null）、`MetricChartCard` `headValue` prop、视图仅占比卡传参；GREEN（5 文件 73 passed）
- [x] 5.4 收口：全量 vitest **2488 passed** + `vue-tsc -b` 0 error；实机 头部值 = 首枚 chip 值（99.99=99.99，Playwright 实测）；16-01 截图重拍（头部 99.98% = chip 99.98%，一致）

## 6. 平均耗时卡头部同改窗口聚合（2026-11-03 用户裁决，design D13 扩展）

> 与占比卡同一约定：头部大数 = 窗口汇总、折线 = 趋势。复用 `headValue` prop，无新共享组件改动；「无增量桶 0.0ms」语义不变。

- [x] 6.1 RED：`tests/test_avg_latency.py` 补 `window_avg_ms`——series 返回 `{points, window_avg_ms}`（ΣΔSum/ΣΔCount 全窗口 3 位舍入）、无数据 null、端点信封透传；GREEN（域回归 200 passed）
- [x] 6.2 RED（前端）：api `getAvgLatencySeries` 返回 `{points, windowAvgMs}`、store `avgLatencyWindowMs`（失败置 null）、视图平均耗时卡传 `head-value`；GREEN（3 文件 51 passed，6 处 mock 形状随契约更新）
- [x] 6.3 收口：域回归 + `vue-tsc -b` + 全量 vitest **2490 passed**；实机 头部 = 窗口聚合值（平均耗时 0.676=0.676、占比 99.99=chip 99.99%，Playwright 实测；旧口径下头部会显示最近桶的 0.0 ms）；16-01 截图重拍
