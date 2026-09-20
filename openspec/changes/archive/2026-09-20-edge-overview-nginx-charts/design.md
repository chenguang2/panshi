# Design: edge-overview-nginx-charts

## Context

- **目标系统**：应用可观测性软件（http://192.168.100.195:8066，v4.0.1）= RuoYi 网关 + 内嵌 datart（React/antd）iframe。组织 orgId=100，CK 数据源 sourceId=`a07a3eacd19f4a799fd0979d00f56c55`（ClickHouse esapm_metrics @192.168.100.42:9000）。全部操作在 Web UI 完成：数据视图（SQL 视图）→ 数据图表（SQL Editor 绑定视图 + 选图表插件）→ 仪表盘（引入 widget、自由布局）。
- **指标现状**：CK 中 18 个 `edge_*` OTel 指标（`docs/monitor/edge-metrics.md`），分存 `otel_metrics_gauge` / `otel_metrics_sum` / `otel_metrics_histogram` 三表，标签内联在 `Attributes` Map 列。
- **仪表盘现状**（已实测抓取配置）：5 个 widget，boardType=free、scaleMode=scaleWidth、设计宽 1920：
  | widget | 图表 | 插件 chartGraphId | rect(x,y,w,h) | 状态 |
  |---|---|---|---|---|
  | stat-edge_nginx_http_current_connections | 6 state 卡 | custom-stat-card | 5,9,1913,206 | 正常 |
  | stat-edge_http_requests_total | 今日请求卡 | custom-stat-card | 7,215,567,207 | 正常 |
  | stat-edge_metric_errors | 错误速率卡 | custom-stat-card | 577,217,510,202 | 正常 |
  | edge-qps | 路由/状态码计数 | demo-custom-line-chart | 13,427,1022,656 | **报错：查询 500** |
  | qcg-edge-scrape | 采集耗时折线 | demo-custom-line-chart | 1044,424,876,649 | 正常但价值低 |
- **坏图根因**：`edge-qps` 视图 SQL 输出 `route_id / status_code / request_count`（TopN 语义），而图表 datas 却配置了不存在的 `qps` 指标列——SQL 输出形状与图表数据映射完全不匹配，前端执行即失败。
- **SQL 模式依据**：`docs/monitor/clickhouse-metrics-sql.md` 已验证的"相邻桶差分"三层结构（桶内按序列 argMax 末值 → 跨序列求和 → lagInFrame 取上一桶），以及该文档对"桶内 max−min ÷ 桶宽"塌陷问题的论证。

## Goals / Non-Goals

**Goals:**
- 修复 edge-qps 坏图，以正确的 QPS 时序折线替代
- 用 8 个新数据视图 + 新图表补齐 Nginx 黄金指标：QPS、连接趋势、状态码分布/趋势、路由 TopN、带宽、延迟、共享字典使用率
- 仪表盘 4 行分区重排，全部图表中文名，无空白无报错
- 保留现有 5 个视图/图表对象不删除，保留 widget 数据零回归

**Non-Goals:**
- 不改磐石网关代码、不改 Edge 采集端（不上报新指标）
- 不做时间范围参数化视图（`公共变量`/`${STARTTIME}` 变量机制），统一静态 `now() - INTERVAL` 窗口
- 不做 P99 分位数（OTel histogram 桶数据在 datart 里算精确分位数成本高，平均延迟已够用）
- 不动 管控平台/详情/nginx 下的旧 v2 表视图（`samples_v2` 旧 schema，另一套体系）
- ~~不通过 datart REST API 批量写入配置~~（实施修订：登录会话内带 Bearer 的 fetch 可直连 datart 写 API，实测可靠后改为 API 写入 + UI 验证；见 D7）

## Decisions

### D1. Counter 速率统一用相邻桶差分（三层结构）
所有基于 Sum 型指标（`edge_http_requests_total`、`edge_http_status`、`edge_bandwidth`）的速率计算使用：

```sql
SELECT bucket,
       greatest((s_last - prev_last) / greatest(date_diff('second', prev_t_last, t_last), 1), 0) AS <rate_col>
FROM (
    SELECT bucket, s_last, t_last,
           lagInFrame(s_last, 1, s_last) OVER (ORDER BY bucket ASC) AS prev_last,
           lagInFrame(t_last, 1, t_last) OVER (ORDER BY bucket ASC) AS prev_t_last
    FROM (
        SELECT bucket, <dim>, sum(v_last) AS s_last, max(t_last) AS t_last
        FROM (
            SELECT toUnixTimestamp(toStartOfInterval(TimeUnix, INTERVAL 900 SECOND)) AS bucket,
                   Attributes, <dim_expr> AS <dim>,
                   argMax(Value, TimeUnix) AS v_last, max(TimeUnix) AS t_last
            FROM <otel_table>
            WHERE MetricName = '<metric>' AND TimeUnix > now() - INTERVAL 86400 SECOND
            GROUP BY bucket, Attributes, <dim>
        ) GROUP BY bucket, <dim> ORDER BY bucket
    )
) ORDER BY bucket
```

- 多序列安全（每桶每序列取末值再求和），右缘桶不假性归零
- 多维度拆分（如状态码类别）时窗口加 `PARTITION BY <dim>`
- 结构不能压缩：聚合不能进窗口函数（Code 184）、`bucket` 必须在最内层计算且中间层 GROUP BY 必须带 bucket（文档实测约束）
- 备选"桶内 max−min ÷ 桶宽"被否决：采集粒度 ≥ 桶粒度时整线归零

### D2. 分类统计（状态码、路由 TopN）用"每序列增量再求和"
文档 §19 的 `GROUP BY status_class` 直接 `max−min` 在多序列下会把"全局最大累计值 − 全局最小累计值"误当增量。改为内层按 `(Attributes, 分类)` 求每序列增量、外层 `sum(inc)`：

```sql
SELECT status_class, sum(inc) AS request_count
FROM (
    SELECT Attributes,
           CASE WHEN Attributes['code'] LIKE '2%' THEN '2xx'
                WHEN Attributes['code'] LIKE '3%' THEN '3xx'
                WHEN Attributes['code'] LIKE '4%' THEN '4xx'
                WHEN Attributes['code'] LIKE '5%' THEN '5xx'
                ELSE '其他' END AS status_class,
           max(Value) - min(Value) AS inc
    FROM otel_metrics_sum
    WHERE MetricName = 'edge_http_status' AND TimeUnix > now() - INTERVAL 86400 SECOND
    GROUP BY Attributes, status_class
)
GROUP BY status_class ORDER BY request_count DESC
```

路由 TopN 同理：内层 `GROUP BY Attributes` 求增量，外层按 `route_id` 汇总排序取 10。

### D3. 时间窗口：趋势 24h + 900s 桶，卡片 1h/5m
- 趋势折线统一 `now() - INTERVAL 86400 SECOND` + `INTERVAL 900 SECOND` 桶（96 个点，与现有文档模板一致）
- 实时卡沿用现有风格：连接卡 1h 窗口 avgIf、错误卡 1h 窗口差分、共享字典 5m 窗口 argMax
- 备选 1h/60s"近 1 小时 QPS"：作为可选项，若实测 900s 桶太粗再降桶宽

### D4. 图表插件复用已在用插件
| 图表 | 视图 | 插件 | datas 映射 |
|---|---|---|---|
| QPS 请求速率 | edge_qps_timeline | demo-custom-line-chart (lines) | 维度 bucket / 指标 qps |
| 连接数趋势 | edge_connections_timeline | demo-custom-line-chart (lines) | 维度 bucket / 指标 active,handled,writing,waiting,reading,accepted（透视列） |
| 状态码分布（24h） | edge_status_distribution | 内置 pie-chart | 维度 status_class / 指标 request_count |
| 状态码趋势 | edge_status_timeline | demo-custom-line-chart (lines) | 维度 bucket / 指标 rps_2xx,rps_3xx,rps_4xx,rps_5xx（透视列） |
| 路由请求量 Top10 | edge_route_top | demo-custom-line-chart (bars，横向条形) | 维度 route_label / 指标 total_requests |
| 带宽趋势 | edge_bandwidth_timeline | demo-custom-line-chart (lines) | 维度 bucket / 指标 ingress_bps,egress_bps（透视列） |
| 平均延迟趋势 | edge_latency_timeline | demo-custom-line-chart (lines) | 维度 bucket / 指标 avg_latency_ms |
| 共享字典使用率 Top10 | edge_shared_dict_usage | demo-custom-line-chart (bars) | 维度 dict_name / 指标 usage_percent |

理由：这三个插件（custom-stat-card / demo-custom-line-chart / demo-custom-pie-chart）均已在系统注册并在现网使用（custom-chart-plugins 全部加载成功），demo-custom-line-chart 的样式类型含 lines/bars 两种，一张插件覆盖折线与条形。实现时若饼图插件对数据形状有额外要求，以 UI 实测为准在两个候选间切换。

### D5. 布局网格（free，设计宽 1920，间距 ~8px，五行，总高 ≈1350 可一屏浏览）
> 2026-09-20 验收后压缩：原 420 行高版总高 ~1920 需滚动，且本定制版滚轮只在图表间窄缝生效、基本不可用；压扁后默认 75% 缩放下一屏全见。

| 行 | y | h | 内容（x, w） |
|---|---|---|---|
| 1 状态卡 | 8 | 110 | 三个 widget 拼 8 等分：连接状态卡 widget 缩至 (8, ≈1434)——内部 6 卡随宽度均分 + 今日请求卡 (≈1450, ≈237) + 采集错误卡 (≈1695, ≈237) |
| 2 流量 | 126 | 300 | QPS 请求速率（8, 954）+ 状态码趋势（970, 942） |
| 3 连接与带宽 | 434 | 300 | 连接数趋势（8, 954）+ 带宽趋势（970, 942） |
| 4 质量与热点 | 742 | 300 | 平均延迟趋势（8, 954）+ 路由请求量 Top10（970, 942） |
| 5 分布与容量 | 1050 | 300 | 状态码分布饼（8, 954）+ 共享字典使用率 Top10（970, 942） |

- 注意：6 张 state 卡是**单个 widget**（一个 datachart 含 6 个 metrics，内部随 widget 宽度均分），不能逐卡拖动；8 等分由"6/8 宽 widget + 两个 1/8 宽单卡 widget"拼出
- 修订记录：原 4 行方案漏排`状态码趋势`槽位（与 spec 冲突），且字典 Top20 在窄槽位不可读，2026-09-20 评审后改为五行网格 + 字典 Top10
- scaleMode=scaleWidth 下按 1920 设计宽等比缩放，无需适配其他断点

### D6. 副本先行、对象只增不删
- 第一步即对 `edge-overview` "另存为" `edge-overview_bak`（免费布局副本）
- 旧 `edge-qps` / `qcg-edge-scrape` 仅从仪表盘移除 widget，图表与视图对象保留
- 所有新图表先落在 `测试 → Nginx` 目录并单图验证，再统一引入仪表盘

### D7. 实施修订：透视列替代 color 分线 + datart 写 API 协议（2026-09-20 实施时确认）
1. **color 分线不可用**：demo-custom-line-chart 的 color section（state / status_class / direction）配置后画布空白无报错——插件源码虽走 `getColorizeGroupSeriesColumns` 路径但渲染失败。连接数 / 状态码趋势 / 带宽三张图改为**视图 SQL 直接透视成多指标列**（与已验证可渲染的 qcg-edge-scrape 多指标模式一致），视图 V2 / V4 / V6 相应改为透视版（见附录）。
2. **写入方式**：原"全部走 UI 手工配置"的前提不成立——登录会话内带 `Authorization: Bearer <localStorage.stoken>` 的 fetch 可直连 datart 写 API，实测可靠。视图/图表用 POST/PUT API 创建（每个对象创建后均经 API 回读 + UI 渲染双重验证），仪表盘组装使用 **PUT /api/v1/viz/dashboards/{id} + widgetToCreate/widgetToUpdate/widgetToDelete 三数组协议**（本部署定制版保存协议，无独立 widgets 端点；`widgets` 数组字段会被服务端静默忽略）。
3. **目录归属**：datachart POST 不接受 parentId，目录归属由 rel 表决定；实施采用"从同目录图表 Save As 复制（天然落位）→ PUT 替换 name/config/viewId"的方式落位，绕开 rel 直写。

### D8. 发布（Publish）与「仪表盘」菜单展示机制（2026-09-20 排查确认）
1. **任何保存都会把仪表盘退回草稿**：datart 侧每次编辑保存（含 API PUT）都会把 `status` 置回 2（草稿）；用 API 显式传 `status:"1"` 也会被服务端强制改回 2。**唯一有效的发布方式是 UI 头部按钮**。
2. **按钮标签语义反直觉**（本定制版）：草稿态（status=2）时按钮显示"取消发布"，点击后**变为已发布**（status=1）；已发布态（status=1）时按钮显示"Publish"，点击反而**取消发布**。发布后用 `status` 字段校验为准，不要看标签。
3. **「仪表盘」菜单页取数**：来自 RuoYi `/getInfo` 返回的根字段 `dashboardId`（仪表盘 id 数组，写进 localStorage `dataUserInfo`）。名单只包含 datart `status=1` 的仪表盘；该页**固定展示名单第一条**（当前第一条是 `pg-overview_集群级`）。名单顺序由 RuoYi 后端维护、与 datart 的 `index` 字段无关，datart 侧无法调序——如需让菜单直接显示 edge-overview，需平台侧把其调整到首位。
4. 运维含义：**每次改完 edge-overview 布局都要重新点发布**，否则它会从该名单消失。

## Risks / Trade-offs

- [新 SQL 在实际 CK 上报错或性能差] → 每个视图先在 SQL Editor"运行"验证再存；差分三层结构为文档实测通过的写法（本 CK 版本）
- [饼图插件对 SQL 输出形状要求（需名称+数值两列）] → status_distribution 视图恰好输出 status_class + request_count 两列；不满足时切换内置"饼/环图"
- [多节点上报后图表线条翻倍] → 全部速率/趋势视图按多序列安全模式编写，序列数增长只影响精度不影响正确性；连接趋势按 state 分线本就预期多条
- [平均延迟为跨序列近似均值（含 type 过滤后仍混合多节点）] → 接受；标题标"平均延迟"，P99 明确列为非目标
- [Edge 端 histogram 未上报 Min/Max] → 实测 24h 内 1440 行 Max 全部为 0，max_latency_ms 是死线，已从 V7 SQL 与图表中移除，只保留平均线
- [Edge 重启导致 Counter 归零] → 趋势速率由 `greatest(..., 0)` 钳 0 兜底（重启点表现为瞬时回落 0）；V3/V5 的 24h `max−min` 增量在"重启后爬升值未超重启前"时会失真，无法在 SQL 层根治，接受为已知取舍
- [共享字典 usage_percent 在 capacity=0 时除零] → SQL 用 `greatest(capacity, 1)` 兜底
- [某字典只上报 capacity 无 free 记录时假报 100%] → 本机 `join_use_nulls=0`，LEFT JOIN 非匹配行以默认值 0 填充；V8 已改用 INNER JOIN 从根上排除（实测当前 41 字典两侧均匹配，纯防御）
- [手工拖拽布局 rect 不精确] → 以 D5 网格为准逐个 widget 在编辑面板核对 x/y/w/h
- [误改现网仪表盘无法回退] → D6 副本先行；新对象只增不删
- [仪表盘默认不自动刷新] → 已于验收时将刷新周期设为 1M（2026-09-20）
- [demo-custom-line-chart 的 color 分线不渲染] → 实测（2026-09-20）：color section 配置 state/status_class/direction 后画布空白（无报错），插件源码走 getColorizeGroupSeriesColumns 路径但渲染失败；已改用"视图 SQL 透视成多指标列"模式（与 qcg-edge-scrape 同款，实测可渲染）

## Migration Plan

1. 另存 `edge-overview_bak` 副本（回退点）
2. `系统管理 → 数据视图 → CK → Nginx` 逐个新建 8 个视图，每个在 SQL Editor 运行验证后保存
3. `可视化管理 → 图表设计 → 测试 → Nginx` 逐个新建 8 个图表（SQL Editor 绑定视图 + 配置 datas/样式），单图预览确认渲染
4. 打开 `edge-overview` 编辑：移除 edge-qps、qcg-edge-scrape widget；拖入/引入新图表；按 D5 调整全部 widget rect 与中文名称
5. 保存 → 验证（见 tasks 验收节）：无报错图块、数据量级合理、截图留档
6. 回滚：如异常，删除新增 widget、从 `edge-overview_bak` 恢复布局；新增的视图/图表对象可保留或删除，不影响旧链路

## Open Questions

- 状态码分布用饼图还是环形/柱状？（默认饼图，实现时看哪种渲染更清晰）
- QPS 折线 900s 桶是否够细腻？（备选 1h/60s 版本，落到同一视图改窗口即可）
- 后续是否要把静态窗口升级为 datart 时间范围变量联动仪表盘日期控件？（本次不做，留作增量）

## Appendix: 8 个数据视图的完整 SQL（可直接粘贴到 SQL Editor）

### V1 edge_qps_timeline（QPS 请求速率，24h/900s 桶）

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

### V2 edge_connections_timeline（连接数趋势，24h/900s 桶，透视 6 列）

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

> 实施修订（2026-09-20）：原"bucket + state + avg_connections"长表版依赖 color 分线，插件实测不渲染，改为 6 列透视版（每列一条序列）。

### V3 edge_status_distribution（状态码分布 24h，每序列增量再求和）

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

### V4 edge_status_timeline（状态码速率趋势，24h/900s 桶，透视 4 列）

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
        greatest((s_last - prev_last) / greatest(date_diff('second', prev_t_last, t_last), 1), 0) AS rps
    FROM (
        SELECT
            bucket, status_class, s_last, t_last,
            lagInFrame(s_last, 1, s_last) OVER (PARTITION BY status_class ORDER BY bucket ASC) AS prev_last,
            lagInFrame(t_last, 1, t_last) OVER (PARTITION BY status_class ORDER BY bucket ASC) AS prev_t_last
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
                    multiIf(Attributes['code'] LIKE '2%', '2xx', Attributes['code'] LIKE '3%', '3xx', Attributes['code'] LIKE '4%', '4xx', Attributes['code'] LIKE '5%', '5xx', '其他') AS status_class,
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

> 实施修订：由"bucket + status_class + rps"长表版改为透视 4 列版（原因同 V2）。

### V5 edge_route_top（路由请求量 Top10，24h，短标签）

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

> route_id 是 UUID（如 `8611306f-d68a-...`），直接作图表维度不可读；route_label 取前 8 位 + matched_uri 组成短标签。

### V6 edge_bandwidth_timeline（带宽趋势，24h/900s 桶，透视 2 列）

```sql
SELECT
    bucket,
    maxIf(bytes_per_sec, direction = 'ingress') AS ingress_bps,
    maxIf(bytes_per_sec, direction = 'egress') AS egress_bps
FROM (
    SELECT
        bucket, direction,
        greatest((s_last - prev_last) / greatest(date_diff('second', prev_t_last, t_last), 1), 0) AS bytes_per_sec
    FROM (
        SELECT
            bucket, direction, s_last, t_last,
            lagInFrame(s_last, 1, s_last) OVER (PARTITION BY direction ORDER BY bucket ASC) AS prev_last,
            lagInFrame(t_last, 1, t_last) OVER (PARTITION BY direction ORDER BY bucket ASC) AS prev_t_last
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

> 实施修订：由"bucket + direction + bytes_per_sec"长表版改为透视 2 列版（原因同 V2）。

### V7 edge_latency_timeline（平均请求延迟，24h/900s 桶，type=request）

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

> 实测（2026-09-20）：Edge 端 OTel SDK 上报的 histogram 未携带 Min/Max（24h 内 1440 行 Max 全部为 0），`max_latency_ms` 会渲染成恒 0 死线，已移除，只保留平均线。

### V8 edge_shared_dict_usage（共享字典使用率 Top10，近 5 分钟）

```sql
SELECT
    c.name AS dict_name,
    toInt64(c.capacity_bytes) AS capacity_bytes,
    toInt64(f.free_bytes) AS free_bytes,
    round((c.capacity_bytes - f.free_bytes) * 100.0 / greatest(c.capacity_bytes, 1), 2) AS usage_percent
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

> 实测（2026-09-20，真实 CK）：环境内有 41 个共享字典（fdict_cache_version、internal_status 等），全量展示不可读，限定 Top10。
> 用 INNER JOIN 而非 LEFT JOIN：本机 `join_use_nulls=0`，LEFT JOIN 非匹配行以默认值 0 填充，某字典若只报 capacity 不报 free 会被算成 100% 假报警；实测当前 41 字典两侧均匹配，此为防御性约束。
