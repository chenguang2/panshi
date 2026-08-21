## 1. 后端 API 实现

- [x] 1.1 在 `backend/app/api/v1/metrics.py` 中新增路由统计 API 端点 `/api/v1/metrics/route-stats`
- [x] 1.2 实现路由 QPS 统计查询（使用 edge_http_status 指标）
- [x] 1.3 实现路由带宽统计查询（使用 edge_bandwidth 指标）
- [x] 1.4 实现路由错误率统计查询（4xx + 5xx）
- [x] 1.5 实现路由延迟统计查询（使用 edge_http_latency 指标）
- [x] 1.6 新增状态码分析 API 端点 `/api/v1/metrics/status-analysis`
- [x] 1.7 实现 HTTP 状态码分类统计（2xx/3xx/4xx/5xx）
- [x] 1.8 实现详细状态码分解（可选）
- [x] 1.9 新增时间对比 API 端点 `/api/v1/metrics/time-comparison`
- [x] 1.10 实现今日 vs 昨日对比统计
- [x] 1.11 实现按小时分布统计（热力图数据）
- [x] 1.12 实现周对比统计
- [x] 1.13 新增节点健康 API 端点 `/api/v1/metrics/node-health`
- [x] 1.14 实现节点健康状态查询（使用 up 指标）
- [x] 1.15 实现资源使用率汇总查询

## 2. 后端测试

- [x] 2.1 为路由统计 API 编写单元测试
- [x] 2.2 为状态码分析 API 编写单元测试
- [x] 2.3 为时间对比 API 编写单元测试
- [x] 2.4 为节点健康 API 编写单元测试
- [x] 2.5 运行所有测试确保通过

## 3. 前端组件实现

- [x] 3.1 新增路由统计卡片组件 `RouteStatsCard.vue`
- [x] 3.2 新增状态码分析图表组件 `StatusAnalysisChart.vue`
- [x] 3.3 新增时间对比组件 `TimeComparisonCard.vue`
- [x] 3.4 新增节点健康状态组件 `NodeHealthCard.vue`
- [x] 3.5 在指标监控页面集成新组件

## 4. 前端测试

- [x] 4.1 为路由统计组件编写单元测试
- [x] 4.2 为状态码分析组件编写单元测试
- [x] 4.3 为时间对比组件编写单元测试
- [x] 4.4 为节点健康组件编写单元测试

## 5. 文档更新

- [x] 5.1 更新 `docs/monitor/clickhouse-metrics-sql.md` 文档，添加新 API 使用说明
- [x] 5.2 更新 API 文档（如存在）
