# Proposal: edge-overview-nginx-charts

## Why

应用可观测性系统的 `edge-overview` 仪表盘目前只有 5 个图表：6 张连接状态数字卡、今日累计请求卡、采集错误速率卡、1 个加载即报错的 `edge-qps` 图（数据查询返回 500，画布空白），以及 1 个对 Nginx 运营价值很低的采集耗时（scrape duration）折线图。第二行存在明显空缺、图表标题直接暴露列名（accepted / total_requests），且缺少 QPS 趋势、HTTP 状态码分布、请求延迟、带宽、路由 TopN 等核心 Nginx 黄金指标，无法支撑 Edge 网关的日常观测与问题定位。

## What Changes

- **修复坏图**：现有 `edge-qps` 图表 SQL 输出列（route_id / status_code / request_count）与图表配置的指标列（qps）不匹配，仪表盘加载时即报"数据库异常"。用新的时序 QPS 折线视图/图表替换它。
- **新增数据视图**（`系统管理 → 数据视图 → CK → Nginx` 目录，约 8 个 SQL 视图）：
  - `edge_qps_timeline`：HTTP 请求速率时序（相邻桶差分，多序列安全）
  - `edge_connections_timeline`：连接数按 state 时序折线
  - `edge_status_distribution`：HTTP 状态码分类分布（2xx/3xx/4xx/5xx，24h）
  - `edge_status_timeline`：状态码分类请求速率时序
  - `edge_route_top`：路由请求量 / QPS Top10 排行
  - `edge_bandwidth_timeline`：进出带宽时序（ingress / egress）
  - `edge_latency_timeline`：平均请求延迟时序（histogram Sum/Count）
  - `edge_shared_dict_usage`：共享内存字典使用率
- **新增数据图表**（`可视化管理 → 图表设计 → 测试 → Nginx` 目录，与视图一一对应，折线 / 柱状 / 饼图 / stat 卡）。
- **重组 `edge-overview` 布局**：约 5 行网格（状态卡行 → 流量趋势行 → 连接/带宽行 → 延迟/热点行 → 分布/容量行），图表标题改用中文可读名称；下线 scrape 采集耗时图（移回图表目录保留，不再占仪表盘版面）。
- **安全网**：动手前先"另存为"一份 `edge-overview_bak` 仪表盘副本；所有新 SQL 采用 `docs/monitor/clickhouse-metrics-sql.md` 已验证的多序列安全模式。

## Capabilities

### New Capabilities

- `edge-overview-dashboard`: 应用可观测性系统中 edge-overview 仪表盘的能力规格——数据视图清单与 SQL 契约、数据图表的类型/字段映射、仪表盘布局与可视化要求、验证方式。

### Modified Capabilities

（无 —— `openspec/specs/` 中无相关既有 spec；`metrics-dashboard` 等均为磐石系统自身的页面能力，与外部可观测性系统互不影响。）

## Impact

- **不改磐石网关代码**：本变更全部在应用可观测性系统（datart，http://192.168.100.195:8066）内通过 UI 配置完成。
- **受影响对象**：CK → Nginx 数据视图目录（新增 ~8 个视图）、测试 → Nginx 图表目录（新增 ~8 个图表）、`edge-overview` 仪表盘（修复 1 图 + 重排布局 + 移除 scrape 图）。
- **数据源**：ClickHouse `esapm_metrics`（192.168.100.42:9000，otel_metrics_gauge / otel_metrics_sum / otel_metrics_histogram 三表），查询均带 `TimeUnix` 时间窗过滤与桶内聚合，压力可控。
- **风险**：误改现有 5 个 widget（用副本规避）；新 SQL 在 ClickHouse 上语法/性能问题（用 SQL Editor 先运行验证）；图表插件能力差异（优先复用仪表盘已在用的 `custom-stat-card`、`demo-custom-line-chart` 插件）。
