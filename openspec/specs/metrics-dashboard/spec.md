# metrics-dashboard

## Purpose

提供指标总览仪表盘页面（`/metrics/dashboard`），以 Grafana 风格的多图表网格展示 Edge 网关关键指标。

## Requirements

### Requirement: Menu integration

The metrics feature SHALL be presented in the sidebar「监控」nav group（AppSidebar navSections 批 9 结构，组内另有独立 feature 的 ClickHouse 配置项）。

Both metrics items SHALL be gated by the `metrics` feature switch and the `metrics` permission — hidden when either fails.

#### Scenario: Metrics items visible (feature enabled)
- **WHEN** the `metrics` feature switch is enabled in `features.yaml`
- **THEN** the「监控」group SHALL show「指标总览」and「指标查询」items
- **AND** the group SHALL be positioned per navSections group order (after 边缘网络, before 运维管理)

#### Scenario: Item「指标总览」
- **WHEN** the user clicks「指标总览」
- **THEN** it SHALL navigate to `/metrics/dashboard`

#### Scenario: Item「指标查询」
- **WHEN** the user clicks「指标查询」
- **THEN** it SHALL navigate to `/metrics`

#### Scenario: Feature disabled
- **WHEN** the `metrics` feature switch is disabled
- **THEN** both metrics items SHALL be hidden

### Requirement: Dashboard page layout

The dashboard SHALL provide a `/metrics/dashboard` route that displays a multi-chart overview page organized into four labeled sections: 核心流量, 流量分析, 运行健康, and the collapsible 更多指标. Each section SHALL render a section header label. The 采集错误率 chart SHALL belong to the 运行健康 section (collection-pipeline health), not the business grid. The global control bar SHALL additionally contain a two-level cluster/node filter (集群 and 节点 selects). The 核心流量 section SHALL arrange: first row QPS + 平均耗时 (2-column), second row Nginx 连接状态 full width.

#### Scenario: Page loads with default metrics
- **WHEN** a user navigates to `/metrics/dashboard`
- **THEN** the page SHALL display a global control bar at the top (time range, refresh interval, auto-refresh toggle, manual refresh, cluster filter, node filter)
- **AND** the control bar SHALL display a last-updated timestamp (更新于 HH:mm:ss) on completion of each refresh cycle
- **AND** the page SHALL render the sections 核心流量, 流量分析, 运行健康, and the collapsible 更多指标, each with a section header label

#### Scenario: Section arrangement and grouping
- **WHEN** the dashboard renders
- **THEN** 核心流量 SHALL contain the QPS chart and the 平均耗时 chart in a 2-column first row, and the Nginx 连接状态 chart full width in the second row
- **AND** 流量分析 SHALL contain the 路由统计 table (full width) plus the HTTP 状态码分析 chart and the 时间对比 card in a 2-column grid
- **AND** 运行健康 SHALL contain the 节点健康 card and the 采集错误率 chart in a 2-column grid
- **AND** no section SHALL leave an empty grid cell

#### Scenario: Business metric definitions
- **WHEN** the dashboard loads
- **THEN** the QPS chart SHALL query `edge_http_requests_total` (Counter → rate, labeled "QPS" with unit `/s`, stored in `otel_metrics_gauge` with `Attributes['ip']`) in 核心流量
- **AND** the 平均耗时 chart SHALL query `edge_http_latency` (`latency_type=request`) from `otel_metrics_histogram` (labeled "平均耗时" with unit `ms` and a 口径标注「近 {time range}」 via the card's scopeLabel) in 核心流量
- **AND** the Nginx 连接状态 chart SHALL query `edge_nginx_http_current_connections` with 4 state series (active/reading/writing/waiting) in 核心流量, and its header value SHALL be labeled 活跃
- **AND** the 采集错误率 chart SHALL query `edge_metric_errors_total` (Counter → rate, unit `/s`) in 运行健康
- **AND** the analysis cards in 流量分析 SHALL display a scope annotation next to the card title (路由统计/HTTP 状态码分析: 近 {time range}; 时间对比: 今日 vs 昨日 / 本周 vs 上周; 节点健康: 实时快照)

#### Scenario: Infrastructure metrics in collapsible section
- **WHEN** the dashboard loads
- **THEN** the collapsible "更多指标" section SHALL contain charts for: `edge_shared_dict_capacity_bytes`, `edge_shared_dict_free_space_bytes`, `scrape_duration_seconds`, `scrape_samples_scraped`, `scrape_series_added`, `up`

### Requirement: Average request latency card

核心流量区的「平均耗时」卡 SHALL 展示全站请求平均处理耗时时间序列：数据源 `edge_http_latency`（`latency_type=request`）@ `otel_metrics_histogram`，算法为每桶窗口增量比值 `ΣΔSum / ΣΔCount`（ms），负增量（计数器重启）钳 0，随时间范围聚合间隔分桶。该卡 SHALL 接入既有的时间范围、刷新编排（手动/自动/单卡重试）、集群筛选与卡片三态机。

#### Scenario: 正常渲染
- **WHEN** 统计窗口内有请求增量
- **THEN** 卡片 SHALL 显示平均耗时 sparkline（ms）与头部最新值（单位 ms）
- **AND** 口径标注「近 {time range}」随卡标题展示

#### Scenario: 无增量桶
- **WHEN** 某桶无请求增量（ΔCount=0）但序列存在
- **THEN** 该桶值 SHALL 为 0.0 ms（事实语义：窗口内没有请求被处理），SHALL NOT 呈现空态文案

#### Scenario: 完全无数据
- **WHEN** 数据源无任何样本行
- **THEN** 卡片 SHALL 呈现空态「暂无上报数据」

#### Scenario: 集群筛选接入
- **WHEN** 用户选定集群/节点/未纳管筛选
- **THEN** 平均耗时卡 SHALL 仅反映筛选集合内节点的数据（filter 参数随请求透传）

#### Scenario: 增量口径
- **WHEN** 计算桶值
- **THEN** 算法 SHALL 为窗口增量比值 ΣΔSum/ΣΔCount（lagInFrame 差分，首桶增量为 0，负增量钳 0）
- **AND** 数值与路由统计-延迟视图（累计比值）不同属预期（语义不同：窗口平均 vs 自启动累计平均）

### Requirement: Global time range control

All charts on the dashboard SHALL share a single time range selector (1h, 6h, 24h, 7d).

#### Scenario: Time range change affects all charts
- **WHEN** a user changes the time range from 1h to 24h
- **THEN** ALL charts SHALL refresh with data spanning the last 24 hours
- **AND** the aggregation interval SHALL adjust: 1h→1m, 6h→5m, 24h→15m, 7d→1h

### Requirement: Auto-refresh

The dashboard SHALL support configurable auto-refresh with 3 options: 60s (default), 120s, 300s.

#### Scenario: Auto-refresh on
- **WHEN** the auto-refresh is enabled (default: on)
- **THEN** all chart data SHALL reload at the configured interval
- **AND** auto-refresh SHALL pause when the page is hidden

#### Scenario: Auto-refresh off
- **WHEN** the user disables auto-refresh via the toggle
- **THEN** charts SHALL NOT auto-refresh
- **AND** a manual "刷新" button SHALL be available

### Requirement: Concurrent data loading

The dashboard SHALL load all chart data concurrently using `Promise.allSettled` with no concurrency limitation. All requests SHALL be dispatched simultaneously.

#### Scenario: All requests succeed
- **WHEN** all metric queries return successfully
- **THEN** all charts SHALL render simultaneously with their data

#### Scenario: Some requests fail
- **WHEN** one or more metric queries fail
- **THEN** the failed charts SHALL show the attributed error copy (数据源不可用，无法读取指标 / 加载失败 ＋ 重试) per the chart state machine
- **AND** the successful charts SHALL render normally

### Requirement: Chart rendering

Each chart SHALL be a compact sparkline-style ECharts line chart with a unified card state machine: loading > error > empty > data.

#### Scenario: Chart with data
- **WHEN** data is available for a metric
- **THEN** the chart SHALL render a line chart with a smooth curve
- **AND** the chart SHALL display a current-value label (latest data point) with its unit
- **AND** hovering over the chart SHALL show a tooltip with exact values

#### Scenario: Chart loading state
- **WHEN** chart data is being fetched (initial load, time-range change, or per-card retry)
- **THEN** the card SHALL show a skeleton/loading placeholder
- **AND** the card SHALL NOT display "当前无数据" or any empty-state copy while loading

#### Scenario: Chart without data
- **WHEN** no data is available for a traffic metric (HTTP 状态码分析, 路由统计)
- **THEN** the chart SHALL display "统计窗口内暂无请求"
- **WHEN** no data is available for a report metric (QPS, Nginx 连接状态, infrastructure metrics, 节点健康, 采集错误率)
- **THEN** the chart SHALL display "暂无上报数据"

#### Scenario: Chart load failure
- **WHEN** a chart query fails while the metrics source is unavailable (`source_ok === false`)
- **THEN** the card SHALL display "数据源不可用，无法读取指标"
- **WHEN** a chart query fails for any other reason
- **THEN** the card SHALL display "加载失败" with a per-card 重试 action that re-issues only that card's request

### Requirement: Collapsible section

Infrastructure metrics SHALL be grouped in a collapsible "更多指标" section below the main business charts.

#### Scenario: Section collapsed by default
- **WHEN** the dashboard loads
- **THEN** the "更多指标" section SHALL be collapsed
- **AND** SHALL show a clickable bar with a count of available infrastructure metrics

#### Scenario: Section expanded
- **WHEN** the user clicks "更多指标"
- **THEN** the section SHALL expand to show additional charts
- **AND** the label SHALL change to "收起"

### Requirement: Dashboard refresh consistency

Manual refresh and auto-refresh SHALL cover ALL dashboard sections: business charts, the analysis cards (路由统计, HTTP 状态码分析, 时间对比), the 运行健康 cards (节点健康, 采集错误率), and the infrastructure section when expanded.

#### Scenario: Manual refresh covers all sections
- **WHEN** the user clicks the 刷新 button
- **THEN** business charts, analysis cards, and 运行健康 cards SHALL reload
- **AND** the infrastructure section SHALL reload if it is expanded

#### Scenario: Auto refresh covers all sections
- **WHEN** auto-refresh is enabled and the timer fires
- **THEN** business charts, analysis cards, and 运行健康 cards SHALL reload
- **AND** the infrastructure section SHALL reload if it is expanded
- **AND** auto-refresh SHALL pause when the page is hidden

#### Scenario: Collapsed infrastructure exempt
- **WHEN** the infrastructure section is collapsed
- **THEN** refresh cycles SHALL NOT issue infrastructure chart requests

#### Scenario: Freshness timestamp
- **WHEN** a refresh cycle completes
- **THEN** the control bar SHALL show 更新于 HH:mm:ss with the completion time

### Requirement: Metric value formatting

All metric values SHALL be rendered in human-readable form via `utils/format.ts`; raw byte counts, unitless percentages, and raw timestamp strings SHALL NOT be displayed.

#### Scenario: Byte values humanized
- **WHEN** a value is a byte count or byte rate (共享字典容量/剩余, route bandwidth, total bytes)
- **THEN** it SHALL be formatted with `formatFileSize` (e.g. 30.5 MB), byte rates suffixed with `/s`

#### Scenario: Percentages and units rendered
- **WHEN** a value is a percentage (错误率, 使用率) or a duration (延迟)
- **THEN** it SHALL render with its unit (% / ms)

#### Scenario: Connection header labeled
- **WHEN** the Nginx 连接状态 card shows its header value
- **THEN** the value SHALL be suffixed with the 活跃 label

### Requirement: Cluster and node filter

指标总览 SHALL 提供两级联动筛选：集群下拉（全部集群 / 各平台集群 / 未纳管节点）与节点下拉（选定具体集群后启用：全部节点 / 该集群节点）。筛选 SHALL 应用于页面全部指标卡（核心流量、流量分析、运行健康、展开中的更多指标），经后端 `filter` 参数（`cluster:{id}` / `node:{ip}` / `unmanaged`）以 ip 集合过滤 ClickHouse 查询，并经 URL query（`?cluster=&node=`）同步保持。

#### Scenario: 默认全部视角
- **WHEN** 用户未选择任何筛选（或缺省进入页面）
- **THEN** 所有指标 SHALL 反馈全部上报数据（含未纳管节点），与现状语义一致

#### Scenario: 按集群筛选
- **WHEN** 用户在集群下拉选择某集群
- **THEN** 节点下拉 SHALL 启用并列出该集群节点（首项「全部节点」）
- **AND** 全部指标卡 SHALL 只反映该集群节点上报的数据

#### Scenario: 按节点筛选
- **WHEN** 用户在节点下拉选择某节点
- **THEN** 全部指标卡 SHALL 只反映该节点上报的数据
- **AND** 节点健康卡 SHALL 仅显示该节点条目

#### Scenario: 未纳管节点视角
- **WHEN** 用户选择「未纳管节点」
- **THEN** 全部指标卡 SHALL 只反映「近 24h 有上报但平台 ps_node 无对应记录」的节点数据
- **AND** 未纳管集合为空时该选项 SHALL 置灰并提示「暂无未纳管节点上报」
- **AND** 空差集 SHALL 返回空数据（诚实空态），SHALL NOT 静默放大成全站视角

#### Scenario: URL 同步
- **WHEN** 用户选定筛选后刷新页面或经 URL 直接访问
- **THEN** 筛选 SHALL 按查询参数（cluster / node）回显并生效
- **AND** 筛选变化 SHALL 经 router.replace 写回 URL（不产生历史记录）
- **AND** URL 携带已失效的集群 id 时 SHALL 静默回退全部视角

#### Scenario: 筛选变化触发全页刷新
- **WHEN** 用户改变任一筛选
- **THEN** 页面 SHALL 触发与手动刷新同路径的全页 reload（业务图、流量分析、运行健康、展开中的基础设施区）
- **AND** 控制行「更新于」时间戳 SHALL 随刷新周期更新

#### Scenario: 数据源不可用时筛选仍可用
- **WHEN** 数据源不可用（`source_ok === false`）
- **THEN** 筛选下拉 SHALL 保持可用（筛选是 UI 态，与数据源连接无关）
