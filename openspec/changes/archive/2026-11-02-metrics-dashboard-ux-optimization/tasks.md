# metrics-dashboard-ux-optimization 任务清单

> 约定：全部按 TDD（先 RED 验证失败原因，再 GREEN）；组件测试挂真实后端响应形状（AGENTS #43）；共享组件语义变更前先 grep 消费方与既有断言、产出断言反转清单，收口用 `npx vitest run --no-file-parallelism`（#217/#208）；类型验证用 `npx vue-tsc -b`（AGENTS #27）；纯前端读取链路 + 一个只读后端字段新增，不触 schema/写库路径，PG 冒烟不强制（AGENTS #31 触发条件不满足）；实机验收用 test 集群 + `manual-screenshots.mjs`（AGENTS #8）。
> 评审基线：`docs/refactoring/metrics-dashboard-ux-review-2026-11-02.md`（19 项：4 高 / 7 中 / 8 低）；截图与 API 取证在 `/tmp/opencode/shots/`。
> 已裁决（design D1–D9）：周对比走前端适配；「采集中断」措辞；使用率阈值 70/85；四分区命名 核心流量/流量分析/运行健康；刷新编排全页统一。

## 1. 后端 · node-health `last_seen_ts`（P0，design D4）
- [x] 1.1 RED：`tests/test_metrics_node_health.py`——`health_type=status` 响应含 `last_seen_ts`（int epoch 秒，≈ `last_seen` 解析值）；`last_seen` 字符串保留
- [x] 1.2 `_query_node_status` SQL 增 `toUnixTimestamp(max(TimeUnix)) AS last_seen_ts`；GREEN
- [x] 1.3 回归 `pytest -k "metrics or node_health"`（确认既有 node-health 用例无字段断言冲突，有则反转）

## 2. 前端 · 共享基座（P0/P1，design D2/D3/D6）
- [x] 2.1 消费方普查：`grep -rn "MetricChartCard\|MetricsSourceBanner"` 全域消费方 + 既有断言清单（#217 前置），确认改动面
- [x] 2.2 `utils/format.ts`：`formatEpochDateTime`（epoch 秒 → 本地时间，绕开 naive-UTC 解析）+ 单测；确认 `formatFileSize` 对 MB 级输出（30.5 MB 形态）
- [x] 2.3 RED（store）：`metricsDashboard.test.ts` 增——刷新编排触发扩展卡 reload 信号、`lastUpdated` 更新、基础设施收起时不发基础设施请求；GREEN（store 增 `lastUpdated` + 刷新编排 contract，扩展卡接入方式按 design D6）
- [x] 2.4 RED（`MetricChartCard`）：三态机断言——loading 骨架优先于空态、error 两类文案（sourceOk=false → 数据源不可用 / 其他 → 加载失败＋重试）、空态按流量/上报两类语境化、byte 单位头部格式化、「活跃」标注（经 props）；GREEN；既有断言反转清单落实
- [x] 2.5 扩展四卡接 `sourceOk` prop：`source_ok === false` 时不发请求直接 error 态，恢复后随刷新周期自愈

## 3. 前端 · 扩展卡修复（P0，design D1/D4/D5/D8）
- [x] 3.1 RED（`TimeComparisonCard`）：周对比渲染 `this_week/last_week`（现状恒空态取证断言 `assert 反转`）、标签随类型切换、变化率后缀、采样覆盖 tooltip + 弱色小字；GREEN
- [x] 3.2 RED（`NodeHealthCard`）：状态列 BadgeStatus（正常/采集中断，裸值断言反转）、`last_seen_ts` 格式化 + 相对时间、字典内存视图（容量 formatFileSize + 使用率进度条阈值色）、类型切换单请求（双请求断言反转）、切换器文案；GREEN
- [x] 3.3 RED（`RouteStatsCard`）：带宽/总流量 formatFileSize、错误率 %/延迟 ms 后缀、路由ID 窄列 + tooltip、未纳管 tooltip、空态语境化；GREEN
- [x] 3.4 `StatusAnalysisChart`：口径标注（近 {range}）+ 空态语境化；GREEN（既有断言兼容性核对）

## 4. 前端 · 页面 IA 与刷新（P1，design D6/D7/D9）
- [x] 4.1 RED（`MetricsDashboard.test.ts`）：四分区结构（核心流量/流量分析/运行健康/更多指标 + 分区标题）、采集错误率位于运行健康组、分析卡口径标注、更新于时间戳、手动刷新触发扩展卡 reload；GREEN
- [x] 4.2 「Nginx 连接状态」头部「活跃」标注接线（props → MetricChartCard）
- [x] 4.3 基础设施折叠条 `div` → `<button type="button">`，键盘可达性断言
- [x] 4.4 INFRA_CHARTS 定义补 `unit: 'bytes'`；口径标注随 timeRange/类型联动

## 5. 收口与实机验收
- [x] 5.1 前端全量 `npx vitest run --no-file-parallelism` 全绿；`npx vue-tsc -b` 零错误；ESLint 对改动文件无新增 error
- [x] 5.2 后端回归 `uv run pytest -k "metrics"` 全绿
- [x] 5.3 实机验收（test 集群，localhost:12345）：① 默认态/展开更多指标/周对比三态截图对比（修复前 vs 修复后）；② 周对比显示 本周请求/上周请求；③ 节点健康显示 正常 badge + 格式化时间 + 使用率进度条；④ 切时间范围卡片进 loading 不闪「当前无数据」；⑤ 手动刷新后扩展四卡与「更新于」同步刷新；⑥ 截图入 `docs/user-manual/images/`（如手册章节涉及）
- [x] 5.4 用户验收确认（UI 术语、措辞、阈值色按 design 文案对照表逐条核对）

## P2 待办（本轮不做，归档时转 note/backlog）
- [ ] 图表 24h/7d 稀疏时间刻度（可选项评估）
- [ ] 变化率 tooltip「请求量较昨日上升/下降 X%」
- [ ] 指标查询页互链（先核查查询页 URL 预填能力）
- [ ] 集群/节点维度筛选（独立立项）
- [ ] 主 spec「Menu integration」菜单场景漂移同步（随归档合并单独处理）
