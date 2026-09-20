# Edge 网关 Nginx 可观测仪表盘实施指南

本文档记录在「应用可观测性系统」中搭建 Edge 网关 Nginx 仪表盘（`edge-overview`）的完整方法，
包括 8 个数据视图 SQL、8 个数据图表配置、仪表盘布局参数、发布机制与实施过程中踩过的坑。
目标是让同一套内容可以迁移到其他环境的同类系统（datart 系）中复现。

- 实施日期：2026-09-20
- 数据来源：ClickHouse `esapm_metrics`（OTel 指标三表）
- 配套材料：截图位于 `docs/monitor/edge-overview-benchmark/`，指标清单见 `docs/monitor/edge-metrics.md`，
  SQL 模式详解见 `docs/monitor/clickhouse-metrics-sql.md`

## 1. 适用范围与目标

### 1.1 适用系统

- 目标系统：本文所述「应用可观测性系统」= RuoYi 门户（Vue）+ 内嵌 datart 的定制版本，版本号 v4.0.1
- 同类系统：任何以 datart 为可视化引擎、以 ClickHouse 为数据源的部署，均可按本文迁移
- 差异点提示：菜单名、按钮文案、栅格参数在不同定制版中可能不同，遇到时以界面实际为准

### 1.2 目标产出

一个 Nginx 观测仪表盘，包含 11 个组件（3 个卡片区 + 8 个图表），覆盖以下指标族：

- 流量：QPS 时序、HTTP 状态码分布、状态码速率趋势、路由请求量 Top10
- 连接：连接数状态实时卡、连接数状态时序
- 质量：平均请求延迟时序
- 容量：带宽进出时序、共享内存字典使用率 Top10

### 1.3 数据流

```text
Edge 网关(OpenResty) --OTel--> ClickHouse(otel_metrics_gauge/sum/histogram)
                                        |
                                        v
                          可观测性系统 数据视图(SQL) -> 数据图表(可视化插件) -> 仪表盘
```

## 2. 前置条件

### 2.1 ClickHouse 与指标

- ClickHouse 服务可访问，库为 `esapm_metrics`，表为 `otel_metrics_gauge`、`otel_metrics_sum`、
  `otel_metrics_histogram`
- 时间列 `TimeUnix`（秒级/纳秒级时间戳，按实际部署确认）；标签维度内联在 `Attributes` Map 列中
- Edge 网关已开启指标上报，且存在以下指标名（缺失的视图会返回空结果，不报错）

### 2.2 可观测性系统

- 具备管理员账号，且组织（orgId）下已配置好指向上述 ClickHouse 的数据源
- 记录该数据源的 `sourceId`（后续建视图/图表需要），示例值 `a07a3eacd19f4a799fd097d00f56c55`
- 数据视图目录已存在（示例为 `CK / Nginx`），图表目录已存在（示例为 `测试 / Nginx`）

### 2.3 指标清单与用途

| 指标名 | 表 | 关键标签 | 用途 |
| --- | --- | --- | --- |
| `edge_http_requests_total` | gauge | - | QPS 请求速率 |
| `edge_http_status` | sum | `route` `matched_uri` `code` | 状态码分布/趋势、路由 Top10 |
| `edge_nginx_http_current_connections` | gauge | `state` | 连接数实时卡与趋势 |
| `edge_http_latency` | histogram | `type` | 平均请求延迟 |
| `edge_bandwidth` | sum | `type`(ingress/egress) | 带宽进出速率 |
| `edge_shared_dict_capacity_bytes` | gauge | `name` | 共享字典容量 |
| `edge_shared_dict_free_space_bytes` | gauge | `name` | 共享字典剩余空间 |
| `edge_metric_errors_total` | sum | - | 采集错误速率（沿用既有视图） |
| `scrape_duration_seconds` | gauge | - | 采集耗时（沿用既有视图，不放入仪表盘） |

### 2.4 表结构与查询要点

| 表 | 数值列 | 说明 |
| --- | --- | --- |
| `otel_metrics_gauge` | `Value` | 瞬时值，取某时刻用 `argMax(Value, TimeUnix)` |
| `otel_metrics_sum` | `Value` | 累计计数器，算速率必须跨桶差分 |
| `otel_metrics_histogram` | `Sum` `Count` `Min` `Max` | 平均值 = `Sum/Count`；`Max` 实测恒为 0（SDK 未上报），不可用于最大值曲线 |

## 3. 实施步骤总览

1. 在数据源下新建 8 个 SQL 数据视图（第 4 章），逐个运行验证
2. 新建 8 个数据图表并绑定对应视图（第 5 章），逐个预览验证
3. 新建（或改造）仪表盘，采用 **auto 自动布局**，摆放 3 个卡片组件 + 8 个图表（第 6 章）
4. 调整卡片样式与行高，使容器与内容高度一致（第 6.3 节）
5. 保存并发布（第 7 章），发布后才会出现在「仪表盘」菜单名单中

> 顺序不可颠倒：视图是图表的数据来源，图表是仪表盘的组件来源。

## 4. 数据视图

### 4.1 通用 SQL 模式（务必遵循）

**计数器速率（Sum 型）必须用「相邻桶差分」三层结构**，不可用「桶内 max−min ÷ 桶宽」：

1. 最内层：按 `bucket + Attributes` 分组，`argMax(Value, TimeUnix)` 取每序列末值
2. 中间层：按 `bucket` 分组，`sum()` 汇总所有序列，得到每桶总量
3. 最外层：`lagInFrame` 取上一桶，`(本桶 − 上桶) / 实际时间差` 得速率，`greatest(..., 0)` 兜底

约束：聚合不能进窗口函数；`bucket` 必须在最内层计算，中间层 `GROUP BY` 必须带 `bucket`；
多维拆分时窗口加 `PARTITION BY <维度>`。

**分类统计**（状态码分布、路由 TopN）用「每序列增量再求和」：内层按 `(Attributes, 分类)`
求 `max(Value) - min(Value)`，外层 `sum(inc)`，避免多序列下把「全局最大 − 全局最小」当成增量。

**图表分线不要用 color 字段**：实测该系统的自定义折线图插件对 `color` 配置不渲染，
多维数据请在 SQL 里透视成多个指标列（每个状态/方向/类别一列）。

### 4.2 V1 edge_qps_timeline（QPS 请求速率）

输出列：`bucket`、`qps`；窗口：24 小时，900 秒桶。

```sql
SELECT
    bucket,
    greatest((s_last - prev_last) / greatest(
        date_diff('second', prev_t_last, t_last), 1), 0) AS qps
FROM (
    SELECT
        bucket, s_last, t_last,
        lagInFrame(s_last, 1, s_last) OVER (ORDER BY bucket ASC) AS prev_last,
        lagInFrame(t_last, 1, t_last) OVER (ORDER BY bucket ASC) AS prev_t_last
    FROM (
        SELECT
            bucket,
            sum(v_last) AS s_last,
            max(t_last) AS t_last
        FROM (
            SELECT
                toUnixTimestamp(toStartOfInterval(TimeUnix, INTERVAL 900 SECOND)) AS bucket,
                Attributes,
                argMax(Value, TimeUnix) AS v_last,
                max(TimeUnix) AS t_last
            FROM otel_metrics_gauge
            WHERE MetricName = 'edge_http_requests_total'
              AND TimeUnix > now() - INTERVAL 86400 SECOND
            GROUP BY bucket, Attributes
        )
        GROUP BY bucket
        ORDER BY bucket
    )
)
ORDER BY bucket
```

![QPS 视图运行结果](./edge-overview-benchmark/view-edge_qps_timeline-run.png)

### 4.3 V2 edge_connections_timeline（连接数趋势）

输出列：`bucket` + 六个状态列（`active` `handled` `writing` `waiting` `reading` `accepted`）。

```sql
SELECT
    toUnixTimestamp(toStartOfInterval(TimeUnix, INTERVAL 900 SECOND)) AS bucket,
    round(avgIf(Value, Attributes['state'] = 'active'), 2) AS active,
    round(avgIf(Value, Attributes['state'] = 'handled'), 2) AS handled,
    round(avgIf(Value, Attributes['state'] = 'writing'), 2) AS writing,
    round(avgIf(Value, Attributes['state'] = 'waiting'), 2) AS waiting,
    round(avgIf(Value, Attributes['state'] = 'reading'), 2) AS reading,
    round(avgIf(Value, Attributes['state'] = 'accepted'), 2) AS accepted
FROM otel_metrics_gauge
WHERE MetricName = 'edge_nginx_http_current_connections'
  AND TimeUnix > now() - INTERVAL 86400 SECOND
GROUP BY bucket
ORDER BY bucket
```

> 原「bucket + state + 数值」长表版依赖图表 color 分线，实测不渲染；透视成 6 列后每列一条曲线。

![连接数趋势视图运行结果](./edge-overview-benchmark/view-edge_connections_timeline-run.png)

### 4.4 V3 edge_status_distribution（状态码分布）

输出列：`status_class`、`request_count`；用于饼图。

```sql
SELECT
    status_class,
    sum(inc) AS request_count
FROM (
    SELECT
        Attributes,
        CASE
            WHEN Attributes['code'] LIKE '2%' THEN '2xx'
            WHEN Attributes['code'] LIKE '3%' THEN '3xx'
            WHEN Attributes['code'] LIKE '4%' THEN '4xx'
            WHEN Attributes['code'] LIKE '5%' THEN '5xx'
            ELSE '其他'
        END AS status_class,
        max(Value) - min(Value) AS inc
    FROM otel_metrics_sum
    WHERE MetricName = 'edge_http_status'
      AND TimeUnix > now() - INTERVAL 86400 SECOND
    GROUP BY Attributes, status_class
)
GROUP BY status_class
ORDER BY request_count DESC
```

![状态码分布视图运行结果](./edge-overview-benchmark/view-edge_status_distribution-run.png)

### 4.5 V4 edge_status_timeline（状态码速率趋势）

输出列：`bucket` + `rps_2xx` `rps_3xx` `rps_4xx` `rps_5xx`。

```sql
SELECT
    bucket,
    maxIf(rps, status_class = '2xx') AS rps_2xx,
    maxIf(rps, status_class = '3xx') AS rps_3xx,
    maxIf(rps, status_class = '4xx') AS rps_4xx,
    maxIf(rps, status_class = '5xx') AS rps_5xx
FROM (
    SELECT
        bucket,
        status_class,
        greatest((s_last - prev_last) / greatest(
            date_diff('second', prev_t_last, t_last), 1), 0) AS rps
    FROM (
        SELECT
            bucket, status_class, s_last, t_last,
            lagInFrame(s_last, 1, s_last)
                OVER (PARTITION BY status_class ORDER BY bucket ASC) AS prev_last,
            lagInFrame(t_last, 1, t_last)
                OVER (PARTITION BY status_class ORDER BY bucket ASC) AS prev_t_last
        FROM (
            SELECT
                bucket,
                status_class,
                sum(v_last) AS s_last,
                max(t_last) AS t_last
            FROM (
                SELECT
                    toUnixTimestamp(toStartOfInterval(TimeUnix, INTERVAL 900 SECOND)) AS bucket,
                    Attributes,
                    multiIf(
                        Attributes['code'] LIKE '2%', '2xx',
                        Attributes['code'] LIKE '3%', '3xx',
                        Attributes['code'] LIKE '4%', '4xx',
                        Attributes['code'] LIKE '5%', '5xx',
                        '其他'
                    ) AS status_class,
                    argMax(Value, TimeUnix) AS v_last,
                    max(TimeUnix) AS t_last
                FROM otel_metrics_sum
                WHERE MetricName = 'edge_http_status'
                  AND TimeUnix > now() - INTERVAL 86400 SECOND
                GROUP BY bucket, Attributes, status_class
            )
            GROUP BY bucket, status_class
            ORDER BY bucket
        )
    )
)
GROUP BY bucket
ORDER BY bucket
```

![状态码趋势视图运行结果](./edge-overview-benchmark/view-edge_status_timeline-run.png)

### 4.6 V5 edge_route_top（路由请求量 Top10）

输出列：`route_label`、`total_requests`、`requests_per_sec`；
`route_label` = route UUID 前 8 位 + 匹配路径。

```sql
SELECT
    route_label,
    sum(inc) AS total_requests,
    greatest(sum(inc) / 86400, 0) AS requests_per_sec
FROM (
    SELECT
        Attributes['route'] AS route_id,
        concat(substring(Attributes['route'], 1, 8), ' ', Attributes['matched_uri']) AS route_label,
        max(Value) - min(Value) AS inc
    FROM otel_metrics_sum
    WHERE MetricName = 'edge_http_status'
      AND TimeUnix > now() - INTERVAL 86400 SECOND
    GROUP BY route_id, route_label, Attributes
)
GROUP BY route_label
ORDER BY total_requests DESC
LIMIT 10
```

> `Attributes['route']` 是 32 位 UUID，直接作图表维度不可读，故拼短标签。

![路由 Top10 视图运行结果](./edge-overview-benchmark/view-edge_route_top-run.png)

### 4.7 V6 edge_bandwidth_timeline（带宽趋势）

输出列：`bucket`、`ingress_bps`、`egress_bps`。

```sql
SELECT
    bucket,
    maxIf(bytes_per_sec, direction = 'ingress') AS ingress_bps,
    maxIf(bytes_per_sec, direction = 'egress') AS egress_bps
FROM (
    SELECT
        bucket, direction,
        greatest((s_last - prev_last) / greatest(
            date_diff('second', prev_t_last, t_last), 1), 0) AS bytes_per_sec
    FROM (
        SELECT
            bucket, direction, s_last, t_last,
            lagInFrame(s_last, 1, s_last)
                OVER (PARTITION BY direction ORDER BY bucket ASC) AS prev_last,
            lagInFrame(t_last, 1, t_last)
                OVER (PARTITION BY direction ORDER BY bucket ASC) AS prev_t_last
        FROM (
            SELECT
                bucket,
                direction,
                sum(v_last) AS s_last,
                max(t_last) AS t_last
            FROM (
                SELECT
                    toUnixTimestamp(toStartOfInterval(TimeUnix, INTERVAL 900 SECOND)) AS bucket,
                    Attributes,
                    Attributes['type'] AS direction,
                    argMax(Value, TimeUnix) AS v_last,
                    max(TimeUnix) AS t_last
                FROM otel_metrics_sum
                WHERE MetricName = 'edge_bandwidth'
                  AND TimeUnix > now() - INTERVAL 86400 SECOND
                GROUP BY bucket, Attributes, direction
            )
            GROUP BY bucket, direction
            ORDER BY bucket
        )
    )
)
GROUP BY bucket
ORDER BY bucket
```

![带宽趋势视图运行结果](./edge-overview-benchmark/view-edge_bandwidth_timeline-run.png)

### 4.8 V7 edge_latency_timeline（平均请求延迟）

输出列：`bucket`、`avg_latency_ms`；仅取 `Attributes['type'] = 'request'`。

```sql
SELECT
    toUnixTimestamp(toStartOfInterval(TimeUnix, INTERVAL 900 SECOND)) AS bucket,
    round(avg(Sum / Count), 2) AS avg_latency_ms
FROM otel_metrics_histogram
WHERE MetricName = 'edge_http_latency'
  AND Attributes['type'] = 'request'
  AND TimeUnix > now() - INTERVAL 86400 SECOND
GROUP BY bucket
ORDER BY bucket
```

> histogram 的 `Max` 列在该采集端恒为 0（实测 24h 内 1440 行全为 0），不要做最大值曲线。

![平均延迟视图运行结果](./edge-overview-benchmark/view-edge_latency_timeline-run.png)

### 4.9 V8 edge_shared_dict_usage（共享字典使用率 Top10）

输出列：`dict_name`、`capacity_bytes`、`free_bytes`、`usage_percent`。

```sql
SELECT
    c.name AS dict_name,
    toInt64(c.capacity_bytes) AS capacity_bytes,
    toInt64(f.free_bytes) AS free_bytes,
    round(
        (c.capacity_bytes - f.free_bytes) * 100.0 / greatest(c.capacity_bytes, 1), 2
    ) AS usage_percent
FROM (
    SELECT Attributes['name'] AS name, argMax(Value, TimeUnix) AS capacity_bytes
    FROM otel_metrics_gauge
    WHERE MetricName = 'edge_shared_dict_capacity_bytes'
      AND TimeUnix > now() - INTERVAL 300 SECOND
    GROUP BY name
) c
INNER JOIN (
    SELECT Attributes['name'] AS name, argMax(Value, TimeUnix) AS free_bytes
    FROM otel_metrics_gauge
    WHERE MetricName = 'edge_shared_dict_free_space_bytes'
      AND TimeUnix > now() - INTERVAL 300 SECOND
    GROUP BY name
) f ON c.name = f.name
ORDER BY usage_percent DESC
LIMIT 10
```

> 必须用 `INNER JOIN`：当 `join_use_nulls=0` 时 LEFT JOIN 的非匹配行以 0 填充，
> 某字典若只报容量不报剩余空间会被算成 100% 假报警。
> 共享字典数量可能很多（实测 41 个），务必 `LIMIT`，否则图表不可读。

![共享字典使用率视图运行结果](./edge-overview-benchmark/view-edge_shared_dict_usage-run.png)

### 4.10 可选：把横轴改为可读时间

默认视图把 `bucket` 输出为 `toUnixTimestamp(...)`（Unix 秒级时间戳，10 位数字），
图表横轴会直接显示 `1789792200` 这类数字。若希望横轴显示 `2026-09-20 13:45` 形式，
把含时间轴的 5 个视图按如下方式调整（其余逻辑不变）：

```sql
-- 改前
toUnixTimestamp(toStartOfInterval(TimeUnix, INTERVAL 900 SECOND)) AS bucket
-- 改后
toStartOfInterval(TimeUnix, INTERVAL 900 SECOND) AS bucket
```

- 涉及视图：V1 与 V4、V6 在 SQL 最内层，V2 与 V7 在最外层；V3、V5、V8 无时间轴
- 视图模型中 `bucket` 列的类型保持 `DATE` 不变
- ClickHouse 侧已实测：改后 5 个视图均正常返回（每视图 97 行，`bucket` 列类型为 `DateTime`）
- 可视化系统侧的横轴渲染效果待验证

## 5. 数据图表

### 5.1 图表清单与数据映射

| 图表名称 | 绑定视图 | 图表插件 | 维度 | 指标 |
| --- | --- | --- | --- | --- |
| QPS 请求速率 | edge_qps_timeline | 自定义折线图（lines） | bucket | qps |
| 状态码趋势 | edge_status_timeline | 自定义折线图（lines） | bucket | rps_2xx, rps_3xx, rps_4xx, rps_5xx |
| 连接数趋势 | edge_connections_timeline | 自定义折线图（lines） | bucket | active, handled, writing, waiting, reading, accepted |
| 带宽趋势 | edge_bandwidth_timeline | 自定义折线图（lines） | bucket | ingress_bps, egress_bps |
| 平均延迟趋势 | edge_latency_timeline | 自定义折线图（lines） | bucket | avg_latency_ms |
| 路由请求量 Top10 | edge_route_top | 自定义折线图（bars） | route_label | total_requests |
| 共享字典使用率 Top10 | edge_shared_dict_usage | 自定义折线图（bars） | dict_name | usage_percent |
| 状态码分布（24h） | edge_status_distribution | 内置饼图（pie-chart） | status_class | request_count |

配置要点：

- 图表数据源模式选「SQL 编辑器」，直接绑定上一步建好的视图
- 指标列必须与视图输出列名完全一致，否则查询报错或图表空白
- 折线图的样式类型有 `lines` / `bars` / `points` 三档，条形图即选 `bars`
- 建图后逐个预览，确认曲线/条形有数据再进入仪表盘环节

### 5.2 图表效果

![QPS 请求速率](./edge-overview-benchmark/chart-QPS_请求速率.png)

![状态码分布（24h）](./edge-overview-benchmark/chart-状态码分布_24h_.png)

![连接数趋势](./edge-overview-benchmark/chart-fixed-连接数趋势.png)

![带宽趋势](./edge-overview-benchmark/chart-fixed-带宽趋势.png)

![平均延迟趋势](./edge-overview-benchmark/chart-平均延迟趋势.png)

![路由请求量 Top10](./edge-overview-benchmark/chart-路由请求量_Top10.png)

![共享字典使用率 Top10](./edge-overview-benchmark/chart-共享字典使用率_Top10.png)

## 6. 仪表盘组装

### 6.1 布局模式必须选 auto（自动布局）

| 布局 | 滚动行为 | 结论 |
| --- | --- | --- |
| free 自由布局 | 绝对定位画布，自定义滚动容器；滚轮悬停在图表上被图表吞掉，只有对准组件间几像素缝隙才生效 | 不可用 |
| auto 自动布局 | 普通文档流，`grid-wrap` 容器原生滚动，滚轮在组件间隙/边距处稳定生效 | 采用 |

切换要点（对有存量 free 仪表盘的场景）：

1. 仪表盘配置 `type` 改为 `auto`，并补齐 auto 布局专用的 `jsonConfig` 属性组
   （基础项 `initialQuery` / `allowOverlap`；
   间距组 `paddingTB` / `paddingLR` / `marginTB` / `marginLR`）
2. 每个组件必须补充栅格定位字段 `pRect {x, y, width, height}`（12 列栅格，`height` 为行单位，
   实测约 33px/单位）
3. 只改 `type` 不补 `pRect` 会导致所有组件堆叠在左上角；用精简过的 `jsonConfig` 或不补
   `customConfig` 会让画布一直停在 Loading

### 6.2 栅格布局表（12 列）

| 行 | 组件 | pRect (x, y, w, h) |
| --- | --- | --- |
| 1 状态卡 | 连接状态总览 | 0, 0, 12, 3 |
| 1 状态卡 | 今日累计请求 | 0, 3, 6, 3 |
| 1 状态卡 | 采集错误速率 | 6, 3, 6, 3 |
| 2 流量 | QPS 请求速率 | 0, 6, 6, 7 |
| 2 流量 | 状态码趋势 | 6, 6, 6, 7 |
| 3 连接与带宽 | 连接数趋势 | 0, 13, 6, 7 |
| 3 连接与带宽 | 带宽趋势 | 6, 13, 6, 7 |
| 4 质量与热点 | 平均延迟趋势 | 0, 20, 6, 7 |
| 4 质量与热点 | 路由请求量 Top10 | 6, 20, 6, 7 |
| 5 分布与容量 | 状态码分布（24h） | 0, 27, 6, 7 |
| 5 分布与容量 | 共享字典使用率 Top10 | 6, 27, 6, 7 |

间距设置：板级 `marginTB` / `paddingTB` = 6、`marginLR` / `paddingLR` = 8；
组件级内边距四边 = 6。全 0 会挤在一起，全 8 又过松。

### 6.3 卡片样式（与容器高度对齐）

数字卡组件（stat-card）的卡片高度写死在插件样式里，默认 200px，必须改小并让组件高度对齐，
否则卡内会出现滚动条或留下大片空白：

| 样式项 | 默认 | 调整后 | 说明 |
| --- | --- | --- | --- |
| 卡片高度 | 200 | 86 | 与组件内高对齐（3 单位 ≈ 99px − 上下内边距 12px） |
| 数值字号 | 50 | 34 | |
| 标签字号 | 28 | 16 | |

关键：这些样式存在于**数据图表实体**中，linkedChart 渲染读取实体配置，改仪表盘里组件的
内嵌副本无效。另外组件配置中的 `customConfig`（含 `props` 与 `interactions`）是渲染必需字段，
**不可删除或精简**，否则整个仪表盘白屏并报 `Cannot read properties of undefined (reading 'props')`。

### 6.4 效果对比

改造前（自由布局，含报错空图、行距过大）：

![改造前](./edge-overview-benchmark/before-full-1.png)

改造后（自动布局，卡片紧凑、图表带间距、可原生滚动）：

![改造后](./edge-overview-benchmark/after-polish-top.png)

![改造后下半屏](./edge-overview-benchmark/after-auto-bottom.png)

## 7. 发布与展示机制

- 仪表盘状态 `status`：`1` = 已发布，`2` = 草稿；只有 `1` 的仪表盘会进入「仪表盘」菜单名单
- **任何保存都会退回草稿**：在系统里编辑保存（含通过接口保存）后 `status` 会变回 2，
  用接口显式传 `status=1` 也会被服务端强制改回 2
- **唯一有效的发布方式**是仪表盘页头部的发布按钮；该按钮文案约定为：
  草稿态显示「取消发布」（点击后变为已发布），已发布态显示「Publish」（点击后变为草稿），
  以状态字段校验为准，不要只看按钮文字
- 「仪表盘」菜单页取数自门户接口返回的 `dashboardId` 数组（写入浏览器 localStorage），
  名单顺序由门户后端维护，与 datart 的 `index` 字段无关；该页固定展示名单第一条

运维含义：每次改完布局都要重新发布一次，否则它不会出现在展示名单里。

## 8. 排错与注意事项

| 现象 | 根因 | 处理 |
| --- | --- | --- |
| 仪表盘一直 Loading | 组件缺少 `customConfig` 必需结构，或 auto 布局缺 `jsonConfig` 属性组 | 补回完整 `customConfig`（可从正常组件复制）；board 配置照抄同类 auto 仪表盘 |
| 所有组件堆叠在左上角 | `type` 改 auto 了但组件没有 `pRect` | 为每个组件补 12 列栅格 `pRect` |
| 卡片出现内部滚动条 | 组件行高小于卡片高度（如行高 2 单位 vs 卡高 86px+内边距） | 组件行高与卡高对齐，统一 3 单位 |
| 卡片下方大片空白 | 卡片高度小于组件内高 | 让 `fristHeight` ≈ 组件内高（行高×33 − 2×内边距） |
| 图表空白但无报错 | 用了图表 `color` 字段做分线 | 改为在 SQL 中透视成多指标列 |
| 查询 500 | 图表指标列名与视图输出列不一致 | 逐列核对视图输出列名 |
| 图线恒为 0 | histogram 的 `Max` 未上报；或速率算法用了桶内 max−min | 去掉最大值线；速率改用相邻桶差分 |
| 字典使用率出现 100% | LEFT JOIN 非匹配行以 0 填充 | 改 `INNER JOIN` |
| 行数过多、排行不可读 | 未限制条数 | 加 `LIMIT`（如 Top10） |
| 图表横轴显示 10 位数字（如 1789792200） | 视图 `bucket` 用了 `toUnixTimestamp()`，输出为 Unix 秒 | 去掉包装、直接输出 `DateTime`（见 4.10 节） |
| 滚轮在图表上无效 | 布局为 free；auto 下悬停图表绘图区正中也会被图表吞掉 | 用 auto 布局，并把鼠标移到组件间隙或边距处滚动 |
| 仪表盘不在「仪表盘」菜单 | 保存后退回草稿（status=2） | 重新点发布按钮 |

## 9. 附录

### 9.1 可视化系统写接口备忘

以下接口在登录会话内携带 `Authorization: Bearer <token>` 可直接调用，便于批量初始化：

| 操作 | 方法与路径 |
| --- | --- |
| 列出数据视图 | `GET /api/v1/views?orgId={orgId}` |
| 新建/更新视图 | `POST /api/v1/views`、`PUT /api/v1/views/{id}` |
| 读取数据图表 | `GET /api/v1/viz/datacharts/{id}` |
| 新建/更新图表 | `POST /api/v1/viz/datacharts`、`PUT /api/v1/viz/datacharts/{id}` |
| 读取仪表盘 | `GET /api/v1/viz/dashboards/{id}` |
| 保存仪表盘 | `PUT /api/v1/viz/dashboards/{id}` |
| 目录树（含实体映射） | `GET /api/v1/viz/folders?orgId={orgId}` |

仪表盘保存请求体的关键字段：

```json
{
  "id": "<dashboardId>",
  "name": "<名称>",
  "orgId": "<orgId>",
  "parentId": "<文件夹 id 或 null>",
  "status": "1",
  "index": 15.03125,
  "config": "<仪表盘配置 JSON 字符串>",
  "subType": "auto",
  "queryVariables": [],
  "widgetToCreate": [],
  "widgetToUpdate": [],
  "widgetToDelete": []
}
```

注意：组件的新增/修改/删除走 `widgetToCreate` / `widgetToUpdate` / `widgetToDelete` 三个数组，
不存在独立的组件接口，也不识别 `widgets` 数组字段（传了会被静默忽略）。

图表的新建请求体不接受目录归属字段，目录关系由系统的关系表决定；实用做法是先用界面在目标
目录内「另存为」一份副本，再通过 `PUT` 替换其名称、视图绑定与配置。

### 9.2 相关文档

- `docs/monitor/edge-metrics.md`：Edge 指标清单
- `docs/monitor/clickhouse-metrics-sql.md`：ClickHouse 指标 SQL 模式详解
- `docs/monitor/metrics-design.md`：指标总览设计
- `openspec/changes/edge-overview-nginx-charts/`：本次变更的提案、设计、任务与验收记录

### 9.3 截图索引

- 视图运行结果：`edge-overview-benchmark/view-*-run.png`（8 张）
- 单个图表效果：`edge-overview-benchmark/chart-*.png`
- 仪表盘改造前后：`edge-overview-benchmark/before-full-*.png`、`after-polish-top.png`、
  `after-auto-bottom.png`
