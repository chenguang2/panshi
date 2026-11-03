# metrics-query-ux-optimization 提案

## Why

实机勘察（2026-11-03，test 环境 `/metrics`，截图 mq-1/mq-2）发现指标查询页与总览页（metrics-dashboard 经三轮优化后）体验断层明显：

1. **首访落在无意义指标上**：默认选中 = 字典序第一个 `edge_http_latency_max`——恰是总览页立项时已证伪的 gauge（进程累计最大，恒值/恒 0，不可作当前读数），实机头部裸「0」+ 全程平线，用户第一眼看到的是「坏数据」。
2. **三态机缺失**：加载中无骨架（控制行一枚小 tag，首访加载期图区误显「当前无数据」——状态误报）；错误仅「数据加载失败」无归因无重试；空态「当前无数据」不区分「数据源不可用 / 该指标无样本 / 采集未上报」。总览页已有成熟三态机（骨架 > 归因错误 + 重试 > 语境化空态），查询页未接入。
3. **指标选择器无组织**：17 个现存指标平铺字典序（业务 HTTP、共享字典、采集器混排），无分组、无搜索；可选清单由后端数据反推，「能查什么」页面不解释。
4. **能力断层**：总览页已有集群/节点两级筛选（metrics-cluster-node-filter）、刷新编排（间隔可选/自动开关/手动刷新/更新于时间戳）、URL 状态同步；查询页全无——固定 60s 自动刷新仅一枚展示性标签，无手动刷新；选中指标/时间范围不进 URL，刷新即丢。
5. **头部口径不明**：大数取最近桶读数，无时间戳、无聚合间隔标注（总览页 D13 已确立「大数=窗口汇总 + 口径标注」约定，#64 已入 AGENTS）。

页面为纯只读查询，无危险操作面（此项现状达标）。

## What Changes

- **指标选择器重组**：按域分组（业务流量与连接 / HTTP 延迟与带宽 / 插件 / 共享字典 / 采集器与节点）+ 可搜索（filterable）；默认指标改 `edge_http_requests_total`（业务主指标，必有数据），不再字典序第一个。
- **查询结果卡接入三态机**：loading 骨架 > 归因错误 + 重试 > 语境化空态；头部值并入卡头并加口径标注（近 {range} · 间隔 {interval} · 更新于 {HH:mm:ss}），大数=最近有效桶读数（查询页语义，显式标注以别于总览页窗口汇总）。
- **刷新编排对齐总览页**：间隔 60/120/300s 可选 + 自动/手动开关 + 立即刷新按钮 + 「更新于 HH:mm:ss」（页面隐藏暂停保留）。
- **集群/节点筛选接入**：与总览页同款两级联动（抽共享 composable，不复制实现），filter 透传既有 `/metrics` time-series 端点（后端已支持，零后端改动）；URL query 同步 `?metric=&range=&cluster=&node=`。
- **业务汇总卡**：固定三卡（数据缺失显示 `--` 而非隐藏卡），口径标注「全站 · 近 5 分钟」，点击卡联动查询（设指标+时间范围）。
- 不做：自定义时间范围（DatePicker）、多指标对比、CSV 导出、告警规则、`latency_max/min` 指标语义修正（采集端范畴）。

## Capabilities

### New Capabilities

- `metrics-query`：指标查询页（`/metrics`）——指标选择、查询结果卡三态、刷新编排、筛选接入、URL 状态、业务汇总卡。

### Modified Capabilities

无（本页此前无 capability spec，全部为新建；不触及其它 capability）。

## Impact

- Affected specs: `metrics-query`（新建，全 ADDED）
- Affected code:
  - frontend: `src/views/Metrics.vue`（重组）、`src/stores/metrics.ts`（筛选/URL/刷新编排/头部口径）、`src/composables/`（新增 `useMetricsFilter.ts`——两级联动从 MetricsDashboard 抽出共享）、`src/views/MetricsDashboard.vue`（改用共享 composable，行为零变化断言钉死）
  - 后端：零改动（time-series 端点已支持 filter；summary 保持全站口径）
  - 测试：`stores/__tests__/metrics.test.ts`、`views/__tests__/Metrics.test.ts`（新）、`MetricsDashboard.test.ts`（共享 composable 抽取回归）
  - docs: 用户手册 24.4 指标查询截图重生成（16-02）
- Dependencies: 无新依赖；纯前端，不触 schema/写库路径。
