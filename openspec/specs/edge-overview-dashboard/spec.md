# edge-overview-dashboard

## Purpose

在外部「应用可观测性系统」（RuoYi 门户 + datart 定制版）中构建与维护 Edge 网关 Nginx 观测仪表盘
`edge-overview` 的能力规格：定义数据视图的存放位置与 SQL 模式、数据图表的类型与字段映射、
仪表盘的布局分区与可视化要求、发布约束，以及验证方式。该能力不改变磐石网关自身代码，
全部配置在可观测性系统内完成。

## Requirements

### Requirement: 数据视图统一存放于 CK→Nginx 目录
edge-overview 仪表盘引用的全部 SQL 数据视图 SHALL 创建在 `系统管理 → 数据视图 → CK → Nginx` 目录下，命名 SHALL 以 `edge_` 为前缀并使用蛇形命名（现有 `scrape`、`edge-qps` 两个视图保留原名不动）。每个视图 SHALL 为 SQL 类型、数据源选择 CK（ClickHouse esapm_metrics，sourceId `a07a3eacd19f4a799fd0979d00f56c55`）。

#### Scenario: 新建数据视图落位正确
- **WHEN** 在数据视图目录树中展开 CK → Nginx
- **THEN** 能看到本变更新增的全部视图（edge_qps_timeline、edge_connections_timeline、edge_status_distribution、edge_status_timeline、edge_route_top、edge_bandwidth_timeline、edge_latency_timeline、edge_shared_dict_usage），且每个视图在 SQL Editor 中点击"运行"能返回数据（无 SQL 报错）

### Requirement: 计数器速率必须采用相邻桶差分模式
凡基于 Counter/Sum 类型指标（edge_http_requests_total、edge_http_status、edge_bandwidth、edge_metric_errors_total）计算速率的视图 SQL，SHALL 采用"每桶按序列取末值 → 跨序列求和 → 窗口函数取上一桶差分"的多序列安全模式（`argMax(Value, TimeUnix)` 分组聚合 + `lagInFrame` 差分 + `greatest(..., 0)` 兜底），SHALL NOT 使用"桶内 max−min ÷ 桶宽"的近似写法。

#### Scenario: 多序列下 QPS 速率不塌陷
- **WHEN** `edge_http_requests_total` 存在多个 Attributes 序列（多台 Edge 节点上报）时运行 edge_qps_timeline 视图
- **THEN** 每个桶输出一条合计速率记录，速率不因序列数增多而归零或出现负值

### Requirement: QPS 时序折线替换损坏的 edge-qps 图
仪表盘中当前报错（查询 500、画布空白）的 `edge-qps` widget SHALL 被移除，改由新数据图表 `QPS 请求速率` 承担：绑定 `edge_qps_timeline` 视图，维度列 `bucket`、指标列 `qps`，使用折线图插件（demo-custom-line-chart），近 24 小时、900 秒桶。

#### Scenario: 仪表盘加载无错误图块
- **WHEN** 打开 edge-overview 仪表盘并等待全部图表加载完成
- **THEN** 不存在带红色告警图标的空白 widget，QPS 区域显示随时间变化的速率曲线

### Requirement: 连接数按 state 的时序与实时卡并存
仪表盘 SHALL 同时提供：① 顶部 6 张连接状态实时数字卡（现有 `stat-edge_nginx_http_current_connections`，保留）；② 新增"连接数趋势"折线图，绑定 `edge_connections_timeline` 视图（维度 bucket，指标为 active / handled / writing / waiting / reading / accepted 六个透视列，近 24 小时、900 秒桶；datart demo-custom-line-chart 插件的 color 分线实测不渲染，视图 SHALL 直接透视成多指标列，SHALL NOT 依赖 color 分线）。

#### Scenario: 连接趋势按 state 分线
- **WHEN** 查看"连接数趋势"图表
- **THEN** active / handled / writing / waiting / reading / accepted 各显示为独立序列，最近时间点数值与顶部状态卡量级一致

### Requirement: HTTP 状态码分布与趋势可视化
仪表盘 SHALL 包含：① "状态码分布（24h）"图（绑定 `edge_status_distribution` 视图，按 2xx/3xx/4xx/5xx 分类聚合 request_count，用饼/环图或柱状图呈现）；② "状态码趋势"时序图（绑定 `edge_status_timeline`，输出 rps_2xx / rps_3xx / rps_4xx / rps_5xx 四个透视列、900 秒桶）。4xx+5xx 占比 SHALL 可直接读出。

#### Scenario: 错误占比可读
- **WHEN** 查看"状态码分布（24h）"图
- **THEN** 各状态类别的请求量与占比可见，能立即判断 4xx/5xx 是否异常升高

### Requirement: 路由 TopN 排行
仪表盘 SHALL 包含"路由请求量 Top10"图（绑定 `edge_route_top` 视图，输出 route_label、requests_per_sec、total_requests，按请求量降序取 10），SHALL 使用水平条形图或表格呈现。视图 SHALL 提供可读标签列 `route_label`（route_id 前 8 位 + matched_uri 组合），SHALL NOT 直接以 UUID 作为图表维度标签。

#### Scenario: 高流量路由排序正确
- **WHEN** 查看"路由请求量 Top10"图
- **THEN** 条目按 24h 请求总量降序排列，最高流量路由排在首位，条目标签为人类可读的短标签（而非完整 UUID）

### Requirement: 带宽与延迟时序
仪表盘 SHALL 包含：① "带宽趋势"图（绑定 `edge_bandwidth_timeline`，输出 ingress_bps / egress_bps 两个透视列，900 秒桶）；② "平均延迟趋势"图（绑定 `edge_latency_timeline`，基于 otel_metrics_histogram 的 Sum/Count 计算平均毫秒，900 秒桶）。

#### Scenario: 带宽分方向展示
- **WHEN** 查看"带宽趋势"图
- **THEN** ingress 与 egress 为两条可区分的曲线，数值随流量波动

#### Scenario: 延迟趋势可读
- **WHEN** 查看"平均延迟趋势"图
- **THEN** 显示平均延迟（ms）随时间变化的曲线，无数据时段不渲染异常值

### Requirement: 共享内存字典使用率
仪表盘 SHALL 包含"共享字典使用率 Top10"图（绑定 `edge_shared_dict_usage` 视图：`(capacity − free) / capacity * 100`，按 dict_name 输出最新使用率与剩余字节，按使用率降序取 Top10——实测环境有 41 个共享字典，全量展示不可读），SHALL 以条形呈现。视图 SHALL 使用 INNER JOIN 关联 capacity 与 free 两侧，SHALL NOT 因某字典缺失 free 记录而显示为 100%（join_use_nulls=0 下 LEFT JOIN 非匹配行以 0 填充会导致假 100%）。

#### Scenario: 使用率百分比展示
- **WHEN** 查看"共享字典使用率 Top10"图
- **THEN** 显示使用率最高的前 10 个字典的使用率百分比（0–100），容量为 0 时显示为空/0 而非报错

#### Scenario: 字典缺失 free 记录时不假报 100%
- **WHEN** 某字典只有 capacity 记录而无 free 记录
- **THEN** 该字典不出现在图中（INNER JOIN 过滤），而不是以 100% 使用率出现

### Requirement: 仪表盘布局分区与中文标题
edge-overview SHALL 采用 auto 自动布局（12 列栅格，与系统内 pg-overview_集群级 同款；free 自由布局的滚轮在本部署存在产品缺陷——悬停图表时被吞、无法滚动），并按以下五行分区重排：
1. **第 1 行（状态卡）**：按 widget 粒度拼 8 等分——6 张连接状态卡所在的单一 widget 缩至约 6/8 宽（内部卡片随宽度自动均分），右端依次补"今日累计请求"卡（复用 `stat-edge_http_requests_total`）与"采集错误速率"卡（复用 `stat-edge_metric_errors`）两个单卡 widget（各约 1/8 宽），填补现有空缺；
2. **第 2 行（流量）**：`QPS 请求速率` 折线 + `状态码趋势` 折线；
3. **第 3 行（连接与带宽）**：`连接数趋势` 折线 + `带宽趋势` 折线；
4. **第 4 行（质量与热点）**：`平均延迟趋势` 折线 + `路由请求量 Top10` 条形；
5. **第 5 行（分布与容量）**：`状态码分布（24h）` 饼图 + `共享字典使用率 Top10` 条形。

所有加入仪表盘的图表 SHALL 显示中文可读名称（编辑 widget 名称），SHALL NOT 以 SQL 列名（如 total_requests、error_per_sec）作为标题直接暴露。

#### Scenario: 布局完整无空缺
- **WHEN** 以 1920 宽度查看 edge-overview 仪表盘全貌
- **THEN** 五行区域均有图表填充，无成片空白；标题为中文（如"QPS 请求速率""连接数趋势"）；且页面可通过滚轮滚动查看全部五行（滚轮悬停在 widget 间隙/边距/标题栏附近时有效；悬停在图表绘图区正中时滚轮被图表组件吞掉属本部署已知产品行为，不构成阻塞）

### Requirement: 仪表盘自动刷新
edge-overview SHALL 开启自动刷新（建议 60s 量级），SHALL NOT 保持默认的关闭状态导致图表仅在打开页面时查询一次。

#### Scenario: 自动刷新生效
- **WHEN** 停留在 edge-overview 页面超过一个刷新周期
- **THEN** 图表数据自动更新（浏览器网络面板可见周期性查询请求）

### Requirement: 下线 scrape 采集耗时图
`qcg-edge-scrape`（采集耗时）widget SHALL 从 edge-overview 仪表盘移除；其数据图表与 `scrape` 数据视图 SHALL 保留在 测试→Nginx / CK→Nginx 目录中不删除。

#### Scenario: scrape 图仅存在于图表目录
- **WHEN** 打开 edge-overview 仪表盘与图表设计左侧树
- **THEN** 仪表盘中无 qcg-edge-scrape widget，且 `测试 → Nginx` 目录下 qcg-edge-scrape 图表仍存在

### Requirement: 现有图表零回归
变更 SHALL NOT 破坏仪表盘中保留的既有 widget：6 张连接状态卡、`stat-edge_http_requests_total`（今日累计请求）、`stat-edge_metric_errors`（采集错误速率）。动手前 SHALL 先对 edge-overview 执行"另存为"生成 `edge-overview_bak` 副本作为回退点。

#### Scenario: 保留图表数据正常
- **WHEN** 变更完成后打开 edge-overview
- **THEN** 连接状态卡、今日累计请求卡、采集错误卡均正常显示数值（与变更前量级一致），且 `edge-overview_bak` 副本可随时恢复

### Requirement: 时间窗口与性能约定
新增视图的默认时间窗 SHALL 与现有视图风格一致：实时类（卡片）≤ 1 小时窗口；趋势类折线为 24 小时窗口、900 秒桶（QPS 折线可选 3600 秒窗口 + 60 秒桶的"近 1 小时"视图，二选一落位）。全部 SQL SHALL 带 `TimeUnix` 时间窗谓词，SHALL NOT 出现无界全表扫描。

#### Scenario: 视图运行耗时可控
- **WHEN** 在 SQL Editor 中逐个运行新增视图
- **THEN** 每个视图在数秒内返回，查询均命中时间窗过滤
