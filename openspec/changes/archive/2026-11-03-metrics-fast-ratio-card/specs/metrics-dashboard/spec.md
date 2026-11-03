# metrics-fast-ratio-card — metrics-dashboard Delta

## MODIFIED Requirements

### Requirement: Dashboard page layout

The dashboard SHALL provide a `/metrics/dashboard` route that displays a multi-chart overview page organized into four labeled sections: 核心流量, 流量分析, 运行健康, and the collapsible 更多指标. Each section SHALL render a section header label. The 采集错误率 chart SHALL belong to the 运行健康 section (collection-pipeline health), not the business grid. The global control bar SHALL additionally contain a two-level cluster/node filter (集群 and 节点 selects). The 核心流量 section SHALL arrange: first row QPS + 平均耗时 + 快速响应占比 (3-column), below the first row a full-width 耗时区间分布 strip (per-bucket ratio chips driven by the fast-ratio request), second row Nginx 连接状态 full width.

#### Scenario: Page loads with default metrics
- **WHEN** a user navigates to `/metrics/dashboard`
- **THEN** the page SHALL display a global control bar at the top (time range, refresh interval, auto-refresh toggle, manual refresh, cluster filter, node filter)
- **AND** the control bar SHALL display a last-updated timestamp (更新于 HH:mm:ss) on completion of each refresh cycle
- **AND** the page SHALL render the sections 核心流量, 流量分析, 运行健康, and the collapsible 更多指标, each with a section header label

#### Scenario: Section arrangement and grouping
- **WHEN** the dashboard renders
- **THEN** 核心流量 SHALL contain the QPS chart, the 平均耗时 chart and the 快速响应占比 chart in a 3-column first row, and the Nginx 连接状态 chart full width in the second row
- **AND** when the viewport is 801–1180px wide the 核心流量 first row SHALL collapse to 2 columns with the 快速响应占比 chart spanning the full row; below 801px it SHALL collapse to a single column
- **AND** 流量分析 SHALL contain the 路由统计 table (full width) plus the HTTP 状态码分析 chart and the 时间对比 card in a 2-column grid
- **AND** 运行健康 SHALL contain the 节点健康 card and the 采集错误率 chart in a 2-column grid
- **AND** no section SHALL leave an empty grid cell
- **AND** 核心流量 SHALL 在第一行下方渲染「耗时区间分布」全宽条：各桶区间占比 chips，数据随快速响应占比卡同源更新（不发独立请求）

#### Scenario: Business metric definitions
- **WHEN** the dashboard loads
- **THEN** the QPS chart SHALL query `edge_http_requests_total` (Counter → rate, labeled "QPS" with unit `/s`, stored in `otel_metrics_gauge` with `Attributes['ip']`) in 核心流量
- **AND** the 平均耗时 chart SHALL query `edge_http_latency` (`latency_type=request`) from `otel_metrics_histogram` (labeled "平均耗时" with unit `ms` and a 口径标注「近 {time range}」 via the card's scopeLabel) in 核心流量
- **AND** the 快速响应占比 chart SHALL query `edge_http_latency` (`latency_type=request`) bucket counts from `otel_metrics_histogram` (labeled "快速响应占比" with unit `%`, 口径标注「近 {time range}」 plus a header 阈值下拉 `≤ {threshold}ms` whose options come from the API `bounds`) in 核心流量
- **AND** the Nginx 连接状态 chart SHALL query `edge_nginx_http_current_connections` with 4 state series (active/reading/writing/waiting) in 核心流量, and its header value SHALL be labeled 活跃
- **AND** the 采集错误率 chart SHALL query `edge_metric_errors_total` (Counter → rate, unit `/s`) in 运行健康
- **AND** the analysis cards in 流量分析 SHALL display a scope annotation next to the card title (路由统计/HTTP 状态码分析: 近 {time range}; 时间对比: 今日 vs 昨日 / 本周 vs 上周; 节点健康: 实时快照)

#### Scenario: Infrastructure metrics in collapsible section
- **WHEN** the dashboard loads
- **THEN** the collapsible "更多指标" section SHALL contain charts for: `edge_shared_dict_capacity_bytes`, `edge_shared_dict_free_space_bytes`, `scrape_duration_seconds`, `scrape_samples_scraped`, `scrape_series_added`, `up`

### Requirement: Average request latency card

核心流量区的「平均耗时」卡 SHALL 展示全站请求平均处理耗时时间序列：数据源 `edge_http_latency`（`latency_type=request`）@ `otel_metrics_histogram`，算法为每桶窗口增量比值 `ΣΔSum / ΣΔCount`（ms），负增量（计数器重启）钳 0，随时间范围聚合间隔分桶。该卡 SHALL 接入既有的时间范围、刷新编排（手动/自动/单卡重试）、集群筛选与卡片三态机。头部值 SHALL 为**窗口聚合均值**（`ΣΔSum / ΣΔCount` 全窗口，与快速响应占比卡头部同约定，见 design D13），SHALL NOT 取「最近一桶」单桶值。

#### Scenario: 正常渲染
- **WHEN** 统计窗口内有请求增量
- **THEN** 卡片 SHALL 显示平均耗时 sparkline（ms）与头部值（单位 ms）
- **AND** 头部值 SHALL 为窗口聚合均值（响应 `window_avg_ms`，与 sparkline 数据同源聚合）；sparkline 保持逐桶趋势（悬停看单桶均值）
- **AND** 口径标注「近 {time range}」随卡标题展示

#### Scenario: 无增量桶
- **WHEN** 某桶无请求增量（ΔCount=0）但序列存在
- **THEN** 该桶值 SHALL 为 0.0 ms（事实语义：窗口内没有请求被处理），SHALL NOT 呈现空态文案

#### Scenario: 完全无数据
- **WHEN** 数据源无任何样本行
- **THEN** 卡片 SHALL 呈现空态「暂无上报数据」
- **AND** 窗口总增量 ΣΔCount=0 时头部值 SHALL 显示 `--`（window_avg_ms=null）

#### Scenario: 集群筛选接入
- **WHEN** 用户选定集群/节点/未纳管筛选
- **THEN** 平均耗时卡 SHALL 仅反映筛选集合内节点的数据（filter 参数随请求透传）

#### Scenario: 增量口径
- **WHEN** 计算桶值
- **THEN** 算法 SHALL 为窗口增量比值 ΣΔSum/ΣΔCount（lagInFrame 差分，首桶增量为 0，负增量钳 0）
- **AND** 数值与路由统计-延迟视图（累计比值）不同属预期（语义不同：窗口平均 vs 自启动累计平均）

## ADDED Requirements

### Requirement: Fast response ratio card

核心流量区的「快速响应占比」卡 SHALL 展示全站请求中「处理耗时 ≤ 阈值」的请求占比时间序列：数据源 `edge_http_latency`（`latency_type=request`）@ `otel_metrics_histogram`，算法为每桶窗口增量精确占比 `ΣΔBucketCounts[1] / ΣΔCount`（%），SHALL NOT 做任何桶内插值。阈值 SHALL 动态取自 `ExplicitBounds[1]`（当前 `10` ms）并随响应返回；该卡 SHALL 接入既有的时间范围、刷新编排（手动/自动/单卡重试）、集群筛选与卡片三态机。该卡 SHALL 同时提供「耗时区间分布」——各桶区间自身的精确占比与计数（窗口聚合，非时间序列），与累计口径互补；分布 SHALL 与累计口径共用同一请求与差分语义，SHALL NOT 做任何桶内插值。

#### Scenario: 正常渲染
- **WHEN** 统计窗口内存在请求增量
- **THEN** 卡片 SHALL 显示占比 sparkline（%）与头部值（单位 %，两位小数，如 `99.98%`）
- **AND** 头部值 SHALL 为**窗口聚合占比**（`ΣΔ前 k 桶 / ΣΔCount`，k = 阈值下标），与耗时区间分布同源：阈值为首边界时 SHALL 严格等于首枚 chip 值
- **AND** 口径标注 SHALL 展示时间范围（「近 {time range}」），阈值 SHALL 由头部阈值控件呈现（`≤ {threshold}ms`）
- **AND** 阈值 SHALL 取自数据（`ExplicitBounds`），SHALL NOT 硬编码

#### Scenario: 头部口径与区间分布一致
- **WHEN** 窗口内存在请求增量（bucket_stats 非空）
- **THEN** 头部值 SHALL 为窗口聚合占比（响应 `window_ratio`），SHALL NOT 取「最近一个有效桶」的单桶占比
- **AND** sparkline SHALL 保持逐桶时间序列（趋势与悬停呈现单桶占比）；窗口无请求时头部 SHALL 显示 `--`

#### Scenario: 阈值可选（仅桶边界）
- **WHEN** 卡片头部渲染阈值控件
- **THEN** 控件 SHALL 为下拉（非自由输入），选项 SHALL 来自接口 `bounds`（= `ExplicitBounds`，不硬编码）
- **AND** 默认值 SHALL 为首边界（当前 10ms）；未取到边界时控件 SHALL 为禁用态
- **AND** 切换阈值 SHALL 仅重发该卡（不触发整页刷新）；后端的权威阈值 SHALL 回写控件
- **AND** 阈值 SHALL NOT 持久化（刷新回默认，与时间范围一致）

#### Scenario: 非法阈值
- **WHEN** 请求 `threshold_ms` 不属于采集桶边界（如 30ms）
- **THEN** 端点 SHALL 返回 400，detail 为「阈值须为采集桶边界之一（… ms），桶内数值无法精确统计」
- **AND** SHALL NOT 插值或静默吸附到最近边界

#### Scenario: 精确占比口径
- **WHEN** 计算桶值
- **THEN** 算法 SHALL 为桶计数增量的比值 `ΣΔBucketCounts[1] / ΣΔCount`（lagInFrame 差分、负增量钳 0、跨序列先求和后相除）
- **AND** 计算 SHALL NOT 采用桶内线性插值或任何分位点估计（桶宽 10ms 下插值结果为伪值，平均 0.875ms 的流量会被插成 P50 5.00ms）

#### Scenario: 区间分布渲染
- **WHEN** 窗口内存在请求增量（bucket_stats 非空）
- **THEN** 页面 SHALL 在核心流量区第一行下方渲染「耗时区间分布」：全部 N+1 桶（N = len(bounds)，末桶为溢出桶 `(bounds[-1], +∞)`）各一枚 chip，主值为区间占比（两位小数，如 `10–20ms 0.03%`）
- **AND** 计数为 0 的桶 SHALL 置灰渲染为 `0.00%`（无条件渲染，不做条件折叠）
- **AND** chip 悬停 SHALL 显示 `{label}：{count} 次（{pct}%）`；口径提示 SHALL 说明左开右闭语义与窗口总量

#### Scenario: 区间分布口径
- **WHEN** 计算 bucket_stats
- **THEN** 每桶占比 SHALL 为 `ΣΔBucketCounts[i] / ΣΔCount × 100`（与累计口径同构：按 Attributes 分区差分、负增量钳 0、跨序列先求和后相除），计数 SHALL 为 `ΣΔBucketCounts[i]`
- **AND** SHALL 为窗口聚合值（SHALL NOT 输出逐桶时间序列）
- **AND** SHALL 携带于 `GET /metrics/fast-ratio` 响应的 `bucket_stats` 字段（`{bounds, ratios, counts, total} | null`），SHALL NOT 新增第二个端点

#### Scenario: 区间分布无数据
- **WHEN** 窗口总请求 `ΣΔCount = 0` 或数据源无样本
- **THEN** `bucket_stats` SHALL 为 null，分布条 SHALL 整块不渲染（SHALL NOT 显示全 0 分布）

#### Scenario: 区间分布随筛选与刷新更新
- **WHEN** 时间范围/集群节点筛选/手动刷新/单卡重试触发快速响应占比卡重发
- **THEN** 区间分布 SHALL 随同一响应更新（单一数据流，无独立请求）

#### Scenario: 无请求桶
- **WHEN** 某桶 ΔCount=0（窗口内没有请求被处理）
- **THEN** 该桶 SHALL NOT 输出数据点（sparkline 不落点，时间轴跨过）
- **AND** 该桶 SHALL NOT 显示为 0%（0% 会被误读为「全部请求都很慢」）

#### Scenario: 完全无数据
- **WHEN** 数据源无任何样本行，或窗口内不存在任何有效桶
- **THEN** 卡片 SHALL 呈现空态「暂无上报数据」

#### Scenario: 集群筛选接入
- **WHEN** 用户选定集群/节点/未纳管筛选
- **THEN** 快速响应占比卡 SHALL 仅反映筛选集合内节点的数据（filter 参数随请求透传）

#### Scenario: 阈值回退
- **WHEN** 响应中取不到桶边界（无行或数组为空）
- **THEN** 阈值 SHALL 回退为 10 ms，卡片 SHALL 仍可正常渲染口径标注
