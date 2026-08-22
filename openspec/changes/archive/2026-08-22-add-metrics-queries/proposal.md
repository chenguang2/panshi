## Why

当前 ClickHouse 指标查询功能已从旧表（samples_v2/time_series_v2）迁移到 OTel 新表（otel_metrics_gauge/otel_metrics_sum/otel_metrics_histogram），但新增的路由维度统计、状态码分类、带宽分析等功能尚未在系统中实现。用户需要通过 DBeaver 直接执行 SQL 查询这些数据，缺乏便捷的 API 和前端展示。

## What Changes

- 新增路由 QPS 统计查询（使用 edge_http_status 替代缺失路由标签的 edge_http_requests_total）
- 新增 HTTP 状态码分类统计（2xx/3xx/4xx/5xx 分组）
- 新增路由带宽 Top 10 排行统计
- 新增路由错误率排行（4xx + 5xx）
- 新增路由延迟排行（P99 近似值）
- 新增今日 vs 昨日环比对比统计
- 新增按小时请求量分布统计（热力图数据）
- 新增节点健康状态监控
- 新增资源使用率汇总（共享字典）

## Capabilities

### New Capabilities
- `route-traffic-stats`: 路由维度流量统计，包括 QPS、带宽、错误率、延迟排行
- `http-status-analysis`: HTTP 状态码分类分析，支持 2xx/3xx/4xx/5xx 分组统计
- `time-comparison`: 时间维度对比分析，支持今日/昨日环比、按小时分布
- `node-health-monitoring`: 节点健康状态监控，基于 up 指标

### Modified Capabilities
- (无现有能力需要修改)

## Impact

- 后端 API：新增 `/api/v1/metrics/route-stats`、`/api/v1/metrics/status-analysis`、`/api/v1/metrics/time-comparison`、`/api/v1/metrics/node-health` 等端点
- 前端页面：新增路由统计、状态码分析、时间对比、节点健康等展示组件
- 数据库：无 schema 变更，仅新增 SQL 查询逻辑
- 依赖：无新增依赖
