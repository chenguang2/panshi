# metrics-query-ux-optimization 任务清单

> 约定：TDD（RED 验证失败原因再 GREEN）；体验评审文档先行（#240），用户确认后动代码；纯前端改动零后端；共享 composable 抽取先普查消费方（#217）；mock 形状取自真实响应（AGENTS #43）；实机验收 test 环境 + 手册 16-02 截图重生成。

## 0. 前置：消费方普查
- [x] 0.1 `useMetricsFilter` 抽取面普查：MetricsDashboard 内联两级联动的全部状态/函数（loadClusterOptions/loadNodes/setClusterFilter/setNodeFilter/URL 回显/选中态 computed）列全；产出「行为零变化」断言清单（选中态/禁用态/联动重置/URL replace 不产历史）

## 1. 共享 composable（D6）
- [x] 1.1 RED：新建 `src/composables/useMetricsFilter.ts`（迁入两级联动状态机 + fetchAllClusterNodes #216 + URL 回显）；MetricsDashboard 改消费共享实现，既有测试零反转（回归 + 零变化断言）；GREEN
- [x] 1.2 `Metrics.vue` 接入两级筛选：filter 透传 `loadChartData`（端点已支持）；切换集群重置节点；筛选进 URL（`?cluster=&node=`，router.replace）

## 2. 指标选择器（D1/D2）
- [x] 2.1 RED：默认指标 `edge_http_requests_total`（不在清单回退首项）；分组渲染（五组 + 其他兜底）；show-search 按 label 过滤；GREEN
- [x] 2.2 分组映射表常量（前缀 → 组）页内实现；未匹配前缀落「其他」

## 3. 结果卡三态与头部（D3/D4）
- [x] 3.1 RED：三态机 loading 骨架 > 归因错误 + 重试 > 语境化空态（「该指标在所选时间范围内无上报数据」/「数据源不可用，无法读取指标」）；loading 期禁止「当前无数据」误报；重试仅重发当前查询；GREEN
- [x] 3.2 RED：头部口径标注「近 {range} · 间隔 {interval} · 更新于 {HH:mm:ss}」；gauge=last、counter=avg 速率 + unit 后缀；无有效桶显示 `--`；GREEN

## 4. 刷新编排（D5）
- [x] 4.1 RED：间隔 60/120/300 下拉 + 自动/手动开关 + 立即刷新 + 更新于时间戳；隐藏暂停保留；单飞守卫保留；GREEN

## 5. 汇总卡（D7）
- [x] 5.1 RED：固定三卡（缺失 `--` 不隐藏）+ 口径标注「全站 · 近 5 分钟」+ 点击联动（设指标触发查询，时间范围不变）+ hover「点击查看趋势」；GREEN

## 7. 控制区版式（D8，用户裁决 2026-11-03）
- [x] 7.1 行 1 与总览页同构（时间范围/刷新间隔/自动/刷新/更新于/集群/节点，gap 16）+ 行 2 指标独占（560px）；集群/节点包「筛选对」容器整对换行（两页同款，实测 1600/1440/1280/1024 四档 8/8 同排，总览页 1440/1280 存量割裂一并修复）；测试语义化定位 + 新增版式断言；全量 **2516 passed**；16-02 重拍

## 8. 指标显示语义（D9，用户反馈 2026-11-03）
- [x] 8.1 RED：store 对 edge_http_status 改调 getStatusAnalysis（since+filter），statusBreakdown 状态；GREEN
- [x] 8.2 RED：视图——状态码指标渲染横向条形图（状态类×计数+百分比，2xx 绿/3xx 蓝/4xx 琥珀/5xx 红）、头部窗口计数无 /s、口径「窗口内计数 · 按状态类组成」；聚合视图徽标+说明（8 指标声明）；GREEN
- [x] 8.3 实机验证：status-analysis 200、头部 1,130,840（纯计数）、2xx 条 100%、聚合徽标 title 正常、零 console 错误；全量 **2523 passed** + tsc 0 + eslint 0（修掉 tooltip 全角空格 no-irregular-whitespace）；手册 24.4.2 补充状态码专项与聚合视图说明
- [x] 8.4 字节类指标头部人性化（用户反馈 2026-11-03）：头部裸字节数 → formatFileSize（容量 10.0 MB / 剩余 9.9 MB / 带宽 0 B/s，速率后缀保留）；isBytesMetric 提为 computed 供头部与图表轴共用

## 6. 收口与实机验收
- [x] 6.1 `npx vitest run --no-file-parallelism`（#208）→ **2515 passed** + `npx vue-tsc -b` → 0 error + ESLint 0 error（manual-screenshots.mjs 2 条存量 warning 非本次引入）；MetricsDashboard 全量回归（composable 抽取零变化）
- [x] 6.2 实机验收（test 环境，Playwright 探针）：①首访默认「总请求数（近5分钟）」出图，头部口径三要素齐；②下拉分组 6 组 + 17 项 + 搜索「延迟」命中 4 项（antdv slot 分组运行时被吞 → 改 options prop 嵌套组，组标题/选项/选中态中文标签全正常）；③集群 test-dns → 节点筛选进 URL（`?cluster=1&node=…&metric=…&range=…`）、查询重载、汇总卡保持「全站 · 近 5 分钟」；④空态归因实证：edge_bandwidth@集群 24h 无数据 → 「该指标在所选时间范围内无上报数据」；⑤汇总卡点击联动 + 固定三卡；⑥零 console/page 错误
- [x] 6.3 手册 24.4 重写（查询控制/结果卡/汇总卡三段）+ 16-02-query 截图重生成（产线原无查询页组，补 `16-02-query` 条目，`--only` 完整名 AGENTS #63）
- [x] 6.4 用户验收确认（2026-11-03：用户实测后提出状态码/字节两处显示语义反馈 → D9 修复复验一致后指示「同步并归档」＝验收通过）
