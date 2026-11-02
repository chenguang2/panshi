# metrics-dashboard-ux-optimization 提案

## Why

指标总览模块 UX 五维评审（2026-11-02，见 `docs/refactoring/metrics-dashboard-ux-review-2026-11-02.md`，19 项问题：4 高 / 7 中 / 8 低）发现四类核心缺陷：

1. **功能承诺与实现脱节（高）**：时间对比卡提供「周对比」选项，但前端字段守卫只认 `today_requests`，而周对比载荷是 `this_week_requests/last_week_requests`——选周对比**永远显示「当前无数据」**（代码 + API 实证）。后端与 `time-comparison` spec 均已交付该能力，纯前端断链。
2. **数据呈现不可读（高）**：节点健康状态列直出裸 `0/1`、最后上报直出微秒时间戳字符串、使用率无 % 无阈值色；共享字典容量/剩余、路由带宽直出原始字节（`30498760`）；错误率无 %、延迟无 ms——与全站 `utils/format.ts` 格式化约定脱节，运维读不懂自己网关的状态。
3. **状态语义制造焦虑（高）**：「数据质量=部分」在统计日未结束（每天大半时段如此）甚至零流量时也标黄警示，不展示后端已返回的采样数——把正常现象呈现成「数据存疑」。
4. **刷新与加载态不一致（中）**：手动刷新与自动刷新只覆盖业务图，路由统计/HTTP 状态/时间对比/节点健康四卡静默陈旧；业务卡无加载态（首载先闪「当前无数据」）；同一「ClickHouse 不可用」故障在页面上有三种表述（横幅 + 业务卡红字 + 扩展卡灰字「当前无数据」）。

## What Changes

**P0（数据可信与功能可用）**
- 周对比真实化：`TimeComparisonCard` 适配周对比载荷（`this_week/last_week_requests`），标签随类型切换（今日请求/昨日请求 ↔ 本周请求/上周请求），变化率后缀「较昨日/较上周」。
- 节点健康可读化：状态列改 BadgeStatus（`正常` / `采集中断`）；后端 `node-health` 响应新增 `last_seen_ts`（Unix epoch 秒，规避 ClickHouse 服务器时区歧义），前端格式化展示并附相对时间；资源视图使用率改「进度条 + % + 阈值色」（>85% 红、70–85% 橙）；类型切换修复双请求；切换器文案改「在线状态 / 字典内存」。
- 数值人性化：共享字典容量/剩余、路由带宽/总流量走 `formatFileSize`；错误率带 %、延迟带 ms；图表卡按单位渲染头部值。
- 数据质量诚实化：tag 保留（完整/部分）但补 tooltip（「今日已采样 501/1440 分钟；统计日未结束时会显示部分，属正常现象」），卡内以弱色小字展示采样数。

**P1（一致性与状态可信）**
- 刷新一致性：手动「刷新」与自动刷新覆盖全部区块（基础设施收起时按需豁免）；控制区新增「更新于 HH:mm:ss」。
- 卡片三态机：统一 loading（骨架）/ empty（语境化文案：流量类「统计窗口内暂无请求」、上报类「暂无上报数据」）/ error（归因文案 + 单卡「重试」）；`source_ok=false` 时全页指标卡统一「数据源不可用，无法读取指标」（与既有横幅同语义）。
- 连接状态卡头部值加「活跃」标注。
- 信息架构重排：四分区 + 分区标题——核心流量（QPS、Nginx 连接状态）/ 流量分析（路由统计、HTTP 状态码分析、时间对比）/ 运行健康（节点健康、采集错误率）/ 更多指标（折叠）；分析类卡片标题右侧加口径标注（「近 24小时」「今日 vs 昨日」「实时快照」）。修复业务 3 卡占 2 列与节点健康半行空白的网格不齐。
- 路由统计列打磨：「路由ID」缩窄 + 省略 + tooltip 全值；「未纳管」加 tooltip；列值带单位。
- 基础设施折叠条改 `<button>` 语义（键盘可达）。

**P2（本轮不做，记待办）**：图表时间坐标轴、变化率色彩语义（保持现状 + tooltip）、指标查询页互链（依赖查询页预填能力，另行核查）、集群/节点维度筛选（独立立项）、主 spec 菜单场景漂移同步（随归档合并单独处理）。

## Capabilities

### New Capabilities

无新增能力域；全部落在既有指标域四能力之内。

### Modified Capabilities

- `metrics-dashboard`：
  - MODIFIED「Dashboard page layout」——四分区结构与分区标题；采集错误率移入运行健康组；基础设施清单与实现对齐（6 项）。
  - MODIFIED「Chart rendering」——三态机（loading/语境化空态/错误归因 + 重试）与「活跃」头部标注。
  - MODIFIED「Concurrent data loading」——失败文案归因化与单卡重试。
  - ADDED「Dashboard refresh consistency」——手动/自动刷新覆盖全部区块 + 更新时间戳。
  - ADDED「Metric value formatting」——字节/百分比/时间戳人性化与单位标注。
- `time-comparison`：
  - ADDED「周对比前端呈现」——周对比载荷渲染、标签随类型切换、变化率后缀。
- `node-health-monitoring`：
  - MODIFIED「Node Health Status Monitoring」——响应新增 `last_seen_ts`（epoch 秒）字段（`last_seen` 保留兼容）。
  - ADDED「Node health card presentation」——状态 badge、时间格式化、使用率进度条与阈值、单请求切换、切换器文案。
- `route-traffic-stats`：
  - ADDED「Route stats card presentation」——列值格式化（字节/%/ms）、未纳管 tooltip、路由ID 列收窄。

## Impact

- Affected specs: `metrics-dashboard`（3 MODIFIED + 2 ADDED）、`time-comparison`（1 ADDED）、`node-health-monitoring`（1 MODIFIED + 1 ADDED）、`route-traffic-stats`（1 ADDED）
- Affected code:
  - backend: `app/services/metrics_service.py`（`_query_node_status` 增加 `last_seen_ts`）、`backend/tests/`（node-health 响应字段用例）
  - frontend: `src/views/MetricsDashboard.vue`（四分区、口径标注、刷新编排、更新时间戳）、`src/stores/metricsDashboard.ts`（全区块刷新编排、`lastUpdated`）、`src/components/MetricChartCard.vue`（三态机、格式化、活跃标注）、`src/components/TimeComparisonCard.vue`（周对比修复、标签切换、采样 tooltip）、`src/components/NodeHealthCard.vue`（badge/时间/进度条/单请求/切换文案）、`src/components/RouteStatsCard.vue`（列格式化、tooltip）、`src/components/StatusAnalysisChart.vue`（口径标注、空态语境化）、`src/utils/format.ts`（epoch 格式化助手，如需）
  - tests: store 刷新编排用例、五组件测试更新（新三态/格式化/周对比断言）、后端 node-health 字段用例
  - docs: `docs/refactoring/metrics-dashboard-ux-review-2026-11-02.md`（评审基线）、用户手册指标总览章节截图（实现后经 `manual-screenshots.mjs` 更新）
