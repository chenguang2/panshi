## 1. ClickHouse 网络配置

- [x] 1.1 修改 ClickHouse config.xml，将 TCP 端口监听从 127.0.0.1 改为 0.0.0.0（已监听 0.0.0.0:9000）
- [x] 1.2 重启 ClickHouse 服务，验证远程 TCP 连接可用（curl http://192.168.100.42:8123 返回 Ok）

## 2. 后端 — 配置与依赖

- [x] 2.1 添加 feature 开关：在 `backend/app/core/features.py` 的 `KNOWN_FEATURES` 中添加 `"metrics"`；在 `backend/features.yaml` 添加 metrics 开关
- [x] 2.2 在 `backend/pyproject.toml` 添加 `clickhouse-driver` 依赖
- [x] 2.3 创建 `backend/app/config/clickhouse.yaml` — ClickHouse 连接配置（host/port/database/user/password/connect_timeout）

## 3. 后端 — 连接与查询服务

- [x] 3.1 创建 `backend/app/services/clickhouse_client.py` — ClickHouse 连接管理（全局 Client 实例，读取 clickhouse.yaml 配置）
- [x] 3.2 创建 `backend/app/services/metrics_service.py` — 封装指标查询逻辑：
  - `query_metric_names()` — 从 samples_v2 查询 DISTINCT metric_name
  - `query_time_series(metric_name, since, interval, label)` — JOIN samples_v2 + time_series_v2；Counter 自动检测（temporality/label/_total 后缀三级检测）并算 rate；标签过滤用 JSONExtractString
  - `query_summary()` — 按 metric_name 聚合最新值

## 4. 后端 — REST API

- [x] 4.1 创建 `backend/app/api/v1/metrics.py`，实现：
  - `GET /api/v1/metrics/names` — 返回指标名列表
  - `GET /api/v1/metrics/{metric_name}` — 时序数据，支持 since/interval/label 参数
  - `GET /api/v1/metrics/summary` — 各指标最新值（按 metric_name 聚合）
- [x] 4.2 在 `backend/app/main.py` 中注册 metrics router（prefix=/api/v1/metrics，feature-gated）
- [x] 4.3 异常处理：ClickHouse 不可用或配置不存在时，所有端点返回 { "data": [] } 而非 500 错误

## 5. 前端 — API 层与状态管理

- [x] 5.1 创建 `frontend/src/types/metrics.ts` — TypeScript 类型定义（MetricDataPoint, MetricSummary 等）
- [x] 5.2 创建 `frontend/src/api/metrics.ts` — API 客户端（getMetricNames, getMetricTimeSeries, getMetricSummary）
- [x] 5.3 创建 `frontend/src/stores/metrics.ts` — Pinia store（selectedMetric, timeRange, chartData, summaryData, loading, error）

## 6. 前端 — 指标监控页面

- [x] 6.1 创建 `frontend/src/views/Metrics.vue` — 页面布局：
  - 指标选择器（dropdown，从 /names 加载）
  - 时间范围选择器（1h/6h/24h/7d）
  - ECharts 折线图（avg 主线条 + max/min 虚线）+ 空数据状态
  - 数字概览卡片（仅业务指标：edge_http_requests_total / edge_nginx_http_current_connections / edge_metric_errors）
- [x] 6.2 实现 60s 自动刷新（页面不可见时暂停，使用 document.hidden）
- [x] 6.3 时间范围变化时自动调整聚合粒度（1h→1m, 6h→5m, 24h→15m, 7d→1h）

## 7. 前端 — 路由与菜单

- [x] 7.1 在 `frontend/src/router/index.ts` 添加 `/metrics` 路由（featureRouteMap）
- [x] 7.2 在侧边栏（AppSidebar.vue）添加"指标监控"菜单项，使用 `featuresStore.has('metrics')` 控制显示

## 8. 验证与测试

- [x] 8.1 验证 ClickHouse 网络可达（curl 192.168.100.42:8123 返回 Ok）
- [x] 8.2 验证后端 API 返回正确数据（curl names / {metric_name} / summary 均返回 200 OK）
- [x] 8.3 验证 Counter rate 计算正确（edge_http_requests_total 返回 rate 0.0133/秒而非原始值 388）
- [x] 8.4 验证 label 过滤效果（edge_nginx_http_current_connections?label=state:active 仅返回 active 连接数据）
- [x] 8.5 验证 feature 开关关闭时菜单不出现（features.yaml 中 metrics: false 则菜单隐藏）
- [x] 8.6 验证 ClickHouse 不可用时的容错（execute_query 返回 None → 空 data）
- [x] 8.7 验证前端编译（vue-tsc --noEmit 退出码 0）
