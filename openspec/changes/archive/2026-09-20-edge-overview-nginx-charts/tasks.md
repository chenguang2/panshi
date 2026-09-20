# Tasks: edge-overview-nginx-charts

> 全部任务在应用可观测性系统 Web UI（http://192.168.100.195:8066，admin）中完成；SQL 均已对真实 ClickHouse 验证通过（见 design.md 附录）。每个任务完成后勾选。

## 1. 准备与安全网

- [x] 1.1 登录系统，`可视化管理 → 图表设计`，对 `edge-overview` 右键"另存为"生成副本 `edge-overview_bak`（放在同目录，作为回退点）
- [x] 1.2 截图记录变更前 edge-overview 仪表盘全貌（存 docs/monitor/ 或会话记录，用于前后对比）

## 2. 新建数据视图（系统管理 → 数据视图 → CK → Nginx）

- [x] 2.1 新建视图 `edge_qps_timeline`：粘贴 design.md 附录 V1 SQL，SQL Editor 运行返回 ~97 行（bucket, qps）后保存
- [x] 2.2 新建视图 `edge_connections_timeline`：粘贴 V2 SQL，运行返回按 state 分组的桶数据（bucket, state, avg_connections）后保存
- [x] 2.3 新建视图 `edge_status_distribution`：粘贴 V3 SQL，运行返回 status_class + request_count 后保存
- [x] 2.4 新建视图 `edge_status_timeline`：粘贴 V4 SQL，运行返回 bucket + status_class + rps 后保存
- [x] 2.5 新建视图 `edge_route_top`：粘贴 V5 SQL，运行返回 route_label + total_requests + requests_per_sec（≤10 行，标签为短标签非完整 UUID）后保存
- [x] 2.6 新建视图 `edge_bandwidth_timeline`：粘贴 V6 SQL，运行返回 bucket + direction + bytes_per_sec 后保存
- [x] 2.7 新建视图 `edge_latency_timeline`：粘贴 V7 SQL，运行返回 bucket + avg_latency_ms 后保存
- [x] 2.8 新建视图 `edge_shared_dict_usage`：粘贴 V8 SQL（INNER JOIN + LIMIT 10），运行返回 dict_name + capacity/free/usage_percent 后保存
- [x] 2.9 确认 8 个视图全部出现在 CK → Nginx 目录且各自可单独运行无报错

## 3. 新建数据图表（可视化管理 → 图表设计 → 测试 → Nginx 目录，+ → 新建数据图表，SQL Editor 方式）

- [x] 3.1 `QPS 请求速率`：选 demo-custom-line-chart（lines），绑定 V1；datas：维度 bucket、指标 qps；运行预览出折线后保存
- [x] 3.2 `连接数趋势`：demo-custom-line-chart（lines），绑定 V2；维度 bucket、指标 avg_connections、颜色 state；预览多条 state 线后保存
- [x] 3.3 `状态码分布（24h）`：demo-custom-pie-chart（或内置"饼/环图"），绑定 V3；维度 status_class、指标 request_count；预览饼图后保存
- [x] 3.4 `状态码趋势`：demo-custom-line-chart（lines），绑定 V4；维度 bucket、指标 rps、颜色 status_class；预览后保存
- [x] 3.5 `路由请求量 Top10`：demo-custom-line-chart（bars 条形模式），绑定 V5；维度 route_label、指标 total_requests；预览条形后保存
- [x] 3.6 `带宽趋势`：demo-custom-line-chart（lines），绑定 V6；维度 bucket、指标 bytes_per_sec、颜色 direction；预览 ingress/egress 两线后保存
- [x] 3.7 `平均延迟趋势`：demo-custom-line-chart（lines），绑定 V7；维度 bucket、指标 avg_latency_ms；预览后保存
- [x] 3.8 `共享字典使用率 Top10`：demo-custom-line-chart（bars），绑定 V8；维度 dict_name、指标 usage_percent；预览条形后保存
- [x] 3.9 若 3.3 饼图插件对数据形状要求不满足，切换为内置"饼/环图"重配并预览

## 4. 重组 edge-overview 仪表盘（编辑面板，free 布局，设计宽 1920）

- [x] 4.1 打开 edge-overview → 编辑：移除 `edge-qps` 与 `qcg-edge-scrape` 两个 widget（图表对象保留在目录中）
- [x] 4.2 第 1 行（y=8, h=200）按 widget 粒度拼 8 等分：连接状态卡 widget 缩至 (x=8, w≈1434)（内部 6 卡自动均分），`stat-edge_http_requests_total` 移到 (x≈1450, w≈237)，`stat-edge_metric_errors` 移到 (x≈1695, w≈237)
- [x] 4.3 第 2 行（y=216, h=420）：引入/新建 `QPS 请求速率`（x=8, w=954）+ `状态码趋势`（x=970, w=942）
- [x] 4.4 第 3 行（y=644, h=420）：`连接数趋势`（x=8, w=954）+ `带宽趋势`（x=970, w=942）
- [x] 4.5 第 4 行（y=1072, h=420）：`平均延迟趋势`（x=8, w=954）+ `路由请求量 Top10`（x=970, w=942）
- [x] 4.6 第 5 行（y=1500, h=420）：`状态码分布（24h）` 饼图（x=8, w=954）+ `共享字典使用率 Top10`（x=970, w=942）
- [x] 4.7 将全部 widget 的显示名称改为中文（QPS 请求速率 / 状态码趋势 / 连接数趋势 / 带宽趋势 / 平均延迟趋势 / 路由请求量 Top10 / 状态码分布（24h）/ 共享字典使用率 Top10 / 今日累计请求 / 采集错误速率及 6 张状态卡中文名），不以 SQL 列名作标题
- [x] 4.8 保存仪表盘
- [x] 4.9 （可选，建议）在仪表盘设置中开启自动刷新，周期 60s 量级

## 5. 验收

- [x] 5.1 打开 edge-overview：无红色告警/空白图块（坏图 edge-qps 已消失），五行区域无成片空白
- [x] 5.2 保留 widget 零回归：6 张状态卡、今日累计请求、采集错误卡数值正常（与 1.2 截图量级一致）
- [x] 5.3 趋势图数据合理性：各折线/条形/饼图渲染出数据点即可（当前低流量环境允许全 0 曲线、单条排行、单块饼——属数据现状非故障）；连接趋势与状态卡量级一致；路由 Top10 排序降序
- [x] 5.4 图表标题全部中文可读；`测试 → Nginx` 目录中 qcg-edge-scrape 图表对象仍在（未删除）
- [x] 5.5 变更后全貌截图留档，与 1.2 前置截图对比确认改善
- [x] 5.6 确认 `edge-overview_bak` 副本可打开（回退点有效）
