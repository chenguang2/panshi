# metrics-query-ux-optimization 设计

## Context

实机勘察记录（2026-11-03，test 环境 `/metrics`，Playwright 截图 `/tmp/opencode/mq-1-default.png`、`mq-2-dropdown.png`）：

| 项 | 现状 |
|---|---|
| 默认选中 | `edge_http_latency_max`（字典序第一个）——总览页立项已证伪的 gauge（进程累计最大、恒值），实机头部裸「0」+ 平线 |
| 指标下拉 | 17 项平铺字典序、无分组、无搜索（未开 filterable）；清单由 ClickHouse 数据反推（`GET /metrics/names`），无数据的指标不出现 |
| 三态机 | 无骨架；首访加载期图区误显「当前无数据」（loading≠无数据，状态误报）；错误=「数据加载失败」无归因无重试 |
| 刷新 | 固定 60s（展示性标签，不可交互）；无手动刷新；无更新时间戳；`document.hidden` 暂停已有 |
| 筛选 | 无集群/节点筛选（总览页已有两级联动 + URL 同步，`/metrics` time-series 端点已支持 filter 参数） |
| 头部值 | 最近有效桶读数（gauge 取 last、counter 取 avg 速率），无时间戳/间隔/口径标注 |
| 汇总卡 | 三卡按数据动态出现（缺失即隐藏，布局跳动）；口径「近 5 分钟」无标注、不随筛选、与查询区无联动 |
| URL | 选中指标/时间范围不进 URL，刷新丢失 |
| 安全 | 纯只读，无危险操作（达标） |

代码事实：页面为页内自绘 ECharts（avg+max 双序列、bytes 轴人性化、自定义 tooltip）；`METRIC_LABELS` 中文映射 90+ 项内联页内；`useMetricsStore` 有 chartInFlight/summaryInFlight 单飞守卫与卸载竞态防护（保留）。

## Goals / Non-Goals

**Goals**：查询页对齐总览页的成熟体系（三态机/刷新编排/两级筛选/URL 状态），首访即见有意义数据，指标可搜可选，状态诚实归因。
**Non-Goals**：自定义时间范围（DatePicker）、多指标对比、CSV 导出、告警规则、`latency_max/min` 采集端语义修正、`METRIC_LABELS` 抽取共享（页内保留）、后端任何改动。

## Decisions

### D1 默认指标 = `edge_http_requests_total`

首访落在业务主指标（必有数据、含义直白），不再字典序第一个。`metricNames` 加载后若无选中则设为该值（不在清单时回退首项）。选中指标持久化进 URL（见 D6），刷新/分享不丢。

### D2 指标选择器：分组 + 可搜索

`a-select` 开 `show-search` + `option-filter-prop="label"`（按「名 — 中文标签」过滤）；选项按前缀映射表分五组（`a-select-optgroup`）：**业务流量与连接**（edge_http_requests/edge_nginx_http_current/edge_metric_errors/edge_bandwidth/edge_http_status）、**HTTP 延迟与请求体**（edge_http_latency*/edge_http_request_/edge_http_response_）、**插件**（edge_plugin_*）、**共享字典**（edge_shared_dict_*）、**采集器与节点暴露**（scrape_*/up/node_*/container_*/edge_cpu/edge_memory 等）；未匹配前缀 → 「其他」。组内按现有字典序保持稳定。分组映射表常量放 `Metrics.vue` 页内（Non-Goal 不抽取）。

### D3 查询结果卡接入三态机（结构对齐总览页，实现保留页内图表）

- **loading > error > empty > data**：loading 显示 shimmer 骨架（总览页同款样式）；error 显示归因文案（数据源不可用 → 「数据源不可用，无法读取指标」，与横幅同源；否则「加载失败」）+ 重试按钮（重发当前查询）；empty 按归因：数据源正常但无样本 → 「该指标在所选时间范围内无上报数据」。
- **修复首访误报**：`loading` 期间不再显示「当前无数据」（骨架优先级最高）。
- 页内自绘 ECharts 保留（avg+max 双序列、bytes 轴、自定义 tooltip 为查询页特有），三态**结构**与总览页一致而非复用 `MetricChartCard`（其单值头部/单位语义不适配查询页）。
- 头部值并入结果卡头：`{指标中文标签} {大数}{单位}` + 口径标注（D5）。大数=**最近有效桶读数**（gauge 取 last、counter 取 avg 速率）——查询页语义是「最新读数」而非总览页的窗口汇总，靠口径标注显式区分（#64 的同口径要求针对「同页并存」，此处无并存冲突，页面级标注诚实即可）。

### D4 头部口径标注

头部值旁 scope 标注：`近 {range} · 间隔 {interval} · 更新于 {HH:mm:ss}`（更新时间=该查询完成时刻，与刷新编排的 lastUpdated 同源）。counter 速率单位沿用点内 `unit` 字段（/s）。

### D5 刷新编排对齐总览页

控制行改：刷新间隔下拉（60/120/300s，默认 60）+ 自动/手动开关 + 「立即刷新」按钮 + 「更新于 HH:mm:ss」；自动模式下 `document.hidden` 暂停保留；间隔/开关切换只影响后续定时，不打断进行中的请求（既有单飞守卫保留）。

### D6 集群/节点筛选接入（两级联动抽共享 composable）

总览页 `MetricsDashboard.vue` 内联的两级联动逻辑（loadClusterOptions/loadNodes/联动重置/URL 回显）抽为 `src/composables/useMetricsFilter.ts`，查询页与总览页共用（**不复制实现**，AGENTS #51 意识）；抽取消后总览页行为零变化（既有测试回归钉死）。查询页筛选变化 → `loadChartData()` 带 filter（端点已支持）；汇总卡不随筛选（D7）。URL 同步 `?metric=&range=&cluster=&node=`（router.replace 不产历史；非法值回退默认）。

### D7 业务汇总卡：固定三卡 + 口径标注 + 点击联动

- 固定渲染三卡（总请求数/Nginx 活跃连接数/采集错误数），数据缺失显示 `--`——消除动态增减卡的布局跳动（AGENTS #54 行高一致精神）。
- 口径标注「全站 · 近 5 分钟」（显式声明不随筛选，避免「选了节点为什么汇总没变」的困惑；一期不做筛选化汇总，成本/收益不成立）。
- 点击「总请求数」卡 → 联动查询（setMetric + setTimeRange），其余两卡同理；卡片 hover 呈可点态。

## 文案对照表

| # | 位置 | 最终文案 |
|---|---|---|
| 1 | 指标下拉 placeholder | 搜索或选择指标 |
| 2 | 下拉分组标题 | 业务流量与连接 / HTTP 延迟与带宽 / 插件 / 共享字典 / 采集器与节点 / 其他 |
| 3 | 空态（数据源正常、无样本） | 该指标在所选时间范围内无上报数据 |
| 4 | 空态（数据源不可用） | 数据源不可用，无法读取指标（横幅同源归因） |
| 5 | 错误态 | 加载失败 ＋ 重试按钮 |
| 6 | 头部口径标注 | 近 {range} · 间隔 {interval} · 更新于 {HH:mm:ss} |
| 7 | 汇总卡口径 | 全站 · 近 5 分钟 |
| 8 | 刷新控制 | 刷新间隔 60s/120s/300s · 自动开关 · 立即刷新 · 更新于 {HH:mm:ss}（与总览页同款） |
| 9 | 汇总卡联动提示 | 点击查看趋势（hover title） |

## Risks / Trade-offs

- **共享 composable 抽取动总览页**：纯重构但有回归面——以 MetricsDashboard 既有测试全量回归 + 新增「行为零变化」断言钉死；若抽取成本超预期，降级为查询页内联实现（记入 tasks 判定点）。
- **分组映射表维护**：Edge 侧新增指标前缀未入表 → 落「其他」组（可见、不丢失）；映射表按前缀而非穷举，维护成本低。
- **头部语义两页不同**（查询页=最新读数、总览页=窗口汇总）：靠口径标注显式区分；#64 约束的是「同页并存冲突」，两页语义差异不构成冲突。
- **filterable 首字母过滤**：a-select 默认按 label 前缀匹配，中文标签可用；如需包含匹配再评估 filterOption 自定义（一期不做）。

### D8 控制区版式（2026-11-03 用户裁决）

两行结构，行 1 与总览页控制行**完全同构**（顺序/间距一致，跨页一致性）：`时间范围 · 刷新间隔 · 自动开关 · 刷新 · 更新于 · 集群 · 节点`（gap 16px）；行 2 = 指标选择器独占一行（加宽至 560px），紧贴查询结果卡——本页主控件与它驱动的结果相邻，全局范围控件在上与总览页对齐。指标下拉的分页内嵌组、搜索行为不变（D2）。

### D9 指标显示语义修正（2026-11-03 用户反馈「HTTP 状态码计数 0/s 误解」）

实况勘察（ClickHouse 72h 窗口序列基数）发现两类显示语义问题：

**F1 — `edge_http_status` 专项呈现**：该指标是**按状态码（Attributes['code']）的计数器**，现行计数器路径把全部序列合并为一条总速率线——图表看不到状态码（价值尽失），头部「计数 0/s」语义自相矛盾。后端已有按状态类聚合的 `GET /metrics/status-analysis`（总览页状态码分析在用，支持 since+filter，#18 单实现精神）→ **零后端改动**：查询页对该指标改调此端点，图表=按状态类组成的横向条形图（2xx 绿 / 3xx 蓝 / 4xx 琥珀 / 5xx 红 / 其他灰，条上标计数与百分比），头部=窗口内请求计数（整数、无 /s），口径标注改「近 {range} · 窗口内计数 · 按状态类组成」。时间范围与集群/节点筛选照常联动。

**F2 — 多序列指标聚合提示**：7 个指标存在多维序列，查询图为其聚合视图（共享字典容量/剩余按 41 个字典名、latency_max/min 按路由×类型 5 序列、plugin_latency_max/min 按插件名 2 序列、bandwidth 按路由×方向 2 序列、upstream_status 按上游实例）——单线「平均值」有掩盖维度的误导风险。前端静态表 `AGGREGATION_NOTES` 声明，头部指标名旁显示轻量「聚合视图」徽标 + title 说明（如「图为全部维度序列的聚合，可按节点筛选缩小范围」）。静态表漂移可接受（新增维度指标落入无提示态，不出错仅少提示）。

**不修**：计数器类中文名（总请求数/采集错误数）保持身份命名——头部 /s 后缀 + 口径标注已消歧；latency_max/min 的 avg-of-maxes 语义属采集端指标设计，另立项。

## Open Questions

无阻塞项。以下裁决点随评审确认（均已给推荐）：

1. 默认指标 = `edge_http_requests_total`（推荐）。
2. 集群/节点筛选一期接入（推荐，抽共享 composable）；备选：一期不做、纯前端轻改。
3. 汇总卡一期保持「全站 · 近 5 分钟」口径（推荐）。
4. `latency_max/min`（进程累计语义、恒 0/恒值）保留在下拉「HTTP 延迟与带宽」组（推荐，采集端语义修正另立项）。
