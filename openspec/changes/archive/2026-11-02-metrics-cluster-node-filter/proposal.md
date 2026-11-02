# metrics-cluster-node-filter 提案

## Why

指标总览当前将**所有集群**的网关指标聚合为全站单值，多集群环境下无法回答「某个集群/某个节点的流量怎么样」这一最高频运维问题；排查单集群异常时只能靠全站曲线肉眼比对。同时评审（`docs/refactoring/metrics-dashboard-ux-review-2026-11-02.md` L8）已将其列为能力缺口。

数据侧已具备条件（2026-11-02 ClickHouse 实测）：全部指标（含 QPS 卡数据源 `edge_http_requests_total`——存于 gauge 表、带 `Attributes['ip']`）均携带上报节点 ip 属性，平台 `ps_node`（ip ↔ cluster_id）可完成集群归属映射。**纯查询过滤改造，无采集端变更。**

## What Changes

- 指标总览控制行新增**两级联动筛选**：集群下拉（全部集群 / 各集群 / 未纳管节点）+ 节点下拉（选具体集群后启用：全部节点 / 该集群节点）；筛选经 URL query（`?cluster=&node=`）同步，刷新/分享保持。
- 后端指标端点（time-series / summary.connectionStates / route-stats / status-analysis / time-comparison / node-health）新增 `filter` 参数，三形态：`cluster:{id}`、`node:{ip}`、`unmanaged`；平台侧单点解析为 ip 集合后以参数化 SQL 过滤 `Attributes['ip'] IN (...)`。
- **QPS 卡保持现行数据源**（`edge_http_requests_total` @ gauge 表，实测带 ip 属性可筛，106k 行单调计数；不换 `edge_http_status`，零口径风险）。
- 筛选变化触发全页 reload（业务 + 流量分析 + 运行健康 + 展开中的基础设施区）；复用既有刷新编排。
- 未纳管定义：近 24h 有上报、但平台 `ps_node` 无对应记录的 ip 集——数据可见不静默丢失。
- 不做（明确裁剪）：图表时间刻度（待办 #1）、指标查询页互链（待办，需查询页预填能力前置）、跨页筛选记忆（仅 URL 同步）。

## Capabilities

### New Capabilities

无新增能力域；集群筛选是既有指标域各能力的查询参数扩展。

### Modified Capabilities

- `metrics-dashboard`：
  - MODIFIED「Dashboard page layout」——控制行描述增加集群/节点筛选控件。
  - ADDED「Cluster and node filter」——两级联动、未纳管选项、URL 同步、全页刷新、全卡生效。
- `route-traffic-stats`：ADDED「Cluster and node filter」——四个视图（QPS/带宽/错误率/延迟）随筛选过滤。
- `time-comparison`：ADDED「Cluster and node filter」——日/周对比随筛选过滤。
- `node-health-monitoring`：ADDED「Cluster and node filter」——在线状态/字典内存视图随筛选过滤。
- `http-status-analysis`：ADDED「Cluster and node filter」——状态码分布随筛选过滤。

## Impact

- Affected specs: 上列 5 个（1 MODIFIED + 4 ADDED 域内扩展）
- Affected code:
  - backend: `app/services/metrics_service.py`（`_resolve_filter_ips` 单点 + 各查询函数加 ips 参数）、`app/api/v1/metrics.py`（6 个端点接线 `filter` 参数）、`backend/tests/test_metrics_cluster_filter.py`（新）
  - frontend: `src/stores/metricsDashboard.ts`（filter 状态 + 组装 + reload 编排）、`src/views/MetricsDashboard.vue`（控制行两下拉 + URL 同步）、`src/api/metrics.ts`（各函数加 filter 参数）、组件测试更新
  - docs: 用户手册指标总览章节补筛选说明 + 截图（实现后）
- Dependencies: 无新依赖；复用 ps_node 映射、`fetchAllClusterNodes`（#216 守卫）、既有 GET /clusters 端点
