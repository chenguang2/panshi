# metrics-cluster-node-filter 设计

## Context

三项用户裁决（2026-11-02）：① 筛选维度 = **集群+节点两级联动**（一期做全）；② QPS 卡**保持现行数据源**（初判「无属性需换源」经实机复核查证为误——`edge_http_requests_total` 存于 `otel_metrics_gauge` 表、带 `Attributes['ip']`、106k 行单调计数，`_total` 后缀启发式已正确路由）；③ 未纳管上报数据**提供选项**可见。

实测数据口径（ClickHouse，2026-11-02）：全部相关指标均带 `Attributes['ip']`——`edge_http_requests_total`(gauge)、`edge_http_status`(code/ip/node/matched_uri/route)、`edge_bandwidth`(ip/node/route/type)、`edge_http_latency`(同)、`edge_metric_errors_total`(ip)、`edge_nginx_http_current_connections`(ip/state)、`edge_shared_dict_*`(ip/name)、`scrape_*`/`up`(ip)。`edge_http_requests_total` 在 sum 表 **0 行**（从未采集，勿再误探）。

映射链：`ps_node`（ip ↔ cluster_id）→ 集群归属；近期上报 ip 集 − 平台节点 ip 集 = 未纳管集合。

## Goals / Non-Goals

**Goals**：任一集群/节点/未纳管视角下，页面所有指标卡数值、表格、图表均只反映该子集；URL 可分享回显；筛选零静默丢数。
**Non-Goals**：不改采集端与指标打标；不做节点健康卡的下钻联动（其本身即节点维度清单）；不做跨会话筛选记忆（仅 URL）；不动指标查询页。

## Decisions

### D1 参数形态：单参数 `filter` 三形态

`filter=cluster:{id}` ｜ `filter=node:{ip}` ｜ `filter=unmanaged`；缺省（无参数）= 不过滤。避免多参数优先级问题，可扩展（未来加 label 维度）。

### D2 解析单点：`_resolve_filter_ips(filter) -> list[str] | None`

- `cluster:{id}`：`SELECT ip FROM ps_node WHERE cluster_id = {id}`（**含禁用节点**——采集端不因平台禁用立即停报，排除会静默丢数）；id 不存在 → 返回 `None` 且响应带 `warning`（前端静默回退全部视角，容错优于报错）。
- `node:{ip}`：格式校验（IPv4 正则）后取 `[ip]`；非法 → 400 中文报错。
- `unmanaged`：`近 24h gauge up 表 DISTINCT ip` − `ps_node.ip 全集`（集合差，Python 侧算，两查询各一次）。
- 解析结果全端点复用；SQL 一律 `AND Attributes['ip'] IN %(ips)s` 参数化（数据源自平台库，仍走参数化习惯）。

### D3 端点接线（6 处，语义边界明确）

| 端点 | 过滤对象 | 边界 |
|---|---|---|
| `GET /metrics/time-series` | 通用时间序列（QPS 卡、连接状态 4 序列、基础设施区） | counter/gauge 两路径均在最内层 WHERE 加 ip 过滤（差分先按序列算再聚合，语义不变） |
| `GET /metrics/summary` | 仅 `connectionStates` 查询 | `source_ok` 是连接级可用性，**不随筛选**（与横幅语义一致） |
| `GET /metrics/route-stats` | 四视图共用入口 | `Attributes['ip']` 过滤 |
| `GET /metrics/status-analysis` | 状态码聚合 | 同上 |
| `GET /metrics/time-comparison` | day/week 两对比 + 采样计数 | hourly_distribution 本页未用，仍同步加（一致性） |
| `GET /metrics/node-health` | status 与 resource 两视图 | 同上 |

### D4 前端交互：两级联动 + URL 同步

- store 增 `clusterId: number | -1 | null`、`nodeIp: string | null`（null=全部）；`-1` 表示未纳管（仅前端态，组装时映射 `filter=unmanaged`）。
- 集群下拉选项：全部集群（默认）+ 平台集群清单（复用既有 GET /clusters）+「未纳管节点」；节点下拉选**具体集群**后启用（全部节点 + 该集群节点列表，走 `fetchAllClusterNodes`——#216 守卫禁止内联单页拉取）；切回「全部集群」节点下拉重置并禁用。
- URL 同步：进入页面读 `?cluster=&node=` 回显；变化经 `router.replace` 写回（不产生历史记录）；失效 id/无上报节点 → 静默回退全部视角。
- 筛选变化 → 触发与手动刷新同路径的全页 reload（含展开中的基础设施区）；「更新于」随之刷新。
- 卡片不加重复标注：当前筛选在控制行始终可见，每卡重复标注是噪音（与 D7 口径标注——时间范围类——不冲突）。
- 下拉在 `source_ok === false` 时保持可用（筛选是 UI 态，与数据源无关；恢复后按筛选 reload）。

### D5 未纳管选项的数据可见性

「全部集群」视角 = 全部上报数据（含未纳管）——现状语义不变；选「未纳管节点」才收窄。未纳管集合为空时选项置灰 + tooltip「暂无未纳管节点上报」。

### D6 权限与安全

- 端点已有 `get_current_user` 依赖不变；`filter` 为查询参数，无越权面（集群 id 枚举不泄露未授权集群数据——指标端点本就全站聚合，不做行级权限，与现状一致）。
- `node:{ip}` 正则校验；`cluster:{id}` int 校验；非法值 400 中文报错（`筛选参数无效，应为 cluster:{id}、node:{ip} 或 unmanaged`）。

## 文案对照表

| # | 位置 | 最终文案 |
|---|---|---|
| 1 | 集群下拉占位 | 全部集群 |
| 2 | 集群下拉附加项 | 未纳管节点（tooltip：上报了指标但平台未纳管的节点） |
| 3 | 节点下拉占位（未选集群） | 先选择集群 |
| 4 | 节点下拉首项（已选集群） | 全部节点 |
| 5 | 非法 filter 400 | 筛选参数无效，应为 cluster:{id}、node:{ip} 或 unmanaged |
| 6 | 失效集群回退 | （静默回退全部视角，无文案） |
| 7 | 未纳管为空 | 该选项置灰 + tooltip「暂无未纳管节点上报」 |

## Risks / Trade-offs

- **查询性能**：`Attributes['ip'] IN (...)` 走 ClickHouse map 键访问，与现有 label 过滤同型；test 集群数据量下无感，生产集群规模（数百节点）下时间序列查询增幅可控——实机验收含大窗口（7d）对照。
- **time-comparison SQL 分支多**（day/week/hourly × 采样计数）：漏改一处即筛选不生效且难察觉——tasks 要求逐分支断言 + 既有 `test_time_comparison` 用例反转覆盖。
- **未纳管集合抖动**：依赖「近 24h 上报」窗口，节点下线 24h 后从未纳管消失——属预期语义（不再有近期数据），文档标注。
- **两下拉联动状态机**（切集群重置节点、URL 回显顺序）是本变更前端主要复杂度，用组件测试钉死状态转换。

## Open Questions

无阻塞项。D1–D6 均给出推荐裁决；若对「未纳管」命名（vs「未分组」）或节点下拉是否要在「全部集群」下也启用有异议，实现前可调，均为文案/交互常量级改动。
