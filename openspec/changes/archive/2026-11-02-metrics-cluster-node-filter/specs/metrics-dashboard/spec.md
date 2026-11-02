# metrics-cluster-node-filter — metrics-dashboard Delta

## MODIFIED Requirements

### Requirement: Dashboard page layout

The dashboard SHALL provide a `/metrics/dashboard` route that displays a multi-chart overview page organized into four labeled sections: 核心流量, 流量分析, 运行健康, and the collapsible 更多指标. Each section SHALL render a section header label. The 采集错误率 chart SHALL belong to the 运行健康 section (collection-pipeline health), not the business grid. The global control bar SHALL additionally contain a two-level cluster/node filter (集群 and 节点 selects).

#### Scenario: Page loads with default metrics
- **WHEN** a user navigates to `/metrics/dashboard`
- **THEN** the page SHALL display a global control bar at the top (time range, refresh interval, auto-refresh toggle, manual refresh, cluster filter, node filter)
- **AND** the control bar SHALL display a last-updated timestamp (更新于 HH:mm:ss) on completion of each refresh cycle
- **AND** the page SHALL render the sections 核心流量, 流量分析, 运行健康, and the collapsible 更多指标, each with a section header label

#### Scenario: Section arrangement and grouping
- **WHEN** the dashboard renders
- **THEN** 核心流量 SHALL contain the QPS chart and the Nginx 连接状态 chart in a 2-column grid
- **AND** 流量分析 SHALL contain the 路由统计 table (full width) plus the HTTP 状态码分析 chart and the 时间对比 card in a 2-column grid
- **AND** 运行健康 SHALL contain the 节点健康 card and the 采集错误率 chart in a 2-column grid
- **AND** no section SHALL leave an empty grid cell (business charts 3-in-2 and single-card half rows SHALL NOT occur)

#### Scenario: Business metric definitions
- **WHEN** the dashboard loads
- **THEN** the QPS chart SHALL query `edge_http_requests_total` (Counter → rate, labeled "QPS" with unit `/s`, stored in `otel_metrics_gauge` with `Attributes['ip']`) in 核心流量
- **AND** the Nginx 连接状态 chart SHALL query `edge_nginx_http_current_connections` with 4 state series (active/reading/writing/waiting) in 核心流量, and its header value SHALL be labeled 活跃
- **AND** the 采集错误率 chart SHALL query `edge_metric_errors_total` (Counter → rate, unit `/s`) in 运行健康
- **AND** the analysis cards in 流量分析 SHALL display a scope annotation next to the card title (路由统计/HTTP 状态码分析: 近 {time range}; 时间对比: 今日 vs 昨日 / 本周 vs 上周; 节点健康: 实时快照)

#### Scenario: Infrastructure metrics in collapsible section
- **WHEN** the dashboard loads
- **THEN** the collapsible "更多指标" section SHALL contain charts for: `edge_shared_dict_capacity_bytes`, `edge_shared_dict_free_space_bytes`, `scrape_duration_seconds`, `scrape_samples_scraped`, `scrape_series_added`, `up`

## ADDED Requirements

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
