## Why

磐石 Admin 当前缺少对 Edge 网关节点的实时指标监控能力。esapm (OpenTelemetry Collector) 已在采集 Edge 节点的 Prometheus 指标（QPS、连接数、共享字典状态等）并存入 ClickHouse，但磐石 Admin 无法查询和展示这些数据。需要打通 ClickHouse 到前端图表的链路，让运维人员能在磐石 Admin 中直接查看 Edge 节点的关键指标图表。

## What Changes

- 修改 ClickHouse 配置，TCP 端口从 127.0.0.1 改为 0.0.0.0，允许磐石后端通过网络访问
- 后端新增 `clickhouse-driver` 依赖，建立到 esapm_metrics 库的连接
- 新增指标查询 REST API（查询指标列表、时序数据、最新概览）
- 前端新增"指标监控"菜单项和页面，使用 ECharts 展示折线图和数字卡片
- 正确处理 OTel ClickHouse schema（samples_v2 JOIN time_series_v2），Counter 类型计算 rate

## Capabilities

### New Capabilities
- `clickhouse-metrics-query`: Edge 节点指标数据的查询与可视化展示

### Modified Capabilities

<!-- No existing specs are modified -->

## Impact

- **ClickHouse**: 需修改监听地址（127.0.0.1 → 0.0.0.0:9000），重启后生效
- **后端**: 新增 `clickhouse-driver` 依赖，新增 `backend/app/services/metrics_service.py` 和 `backend/app/api/v1/metrics.py`
- **前端**: 新增 `frontend/src/views/Metrics.vue`，`frontend/src/api/metrics.ts`，`frontend/src/stores/metrics.ts`
- **菜单**: 侧边栏新增"指标监控"入口
- **端口**: ClickHouse TCP 9000 需对磐石后端服务器开放网络访问
