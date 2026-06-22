## Context

磐石 Admin 当前有 `/api/v1/dashboard/stats` 返回资源计数（集群数、路由数等），但缺少 Edge 网关节点的实时性能指标（QPS、连接数等）。esapm (OpenTelemetry Collector) 已在 192.168.100.42 上运行，每 60s 从 Edge 节点 192.168.100.235:15001 的 `/edge/monitor/metrics` 抓取 Prometheus 格式指标，通过 `clickhousemetricswrite` exporter 写入同一机器上的 ClickHouse 实例（`esapm_metrics` 库）。

ClickHouse 使用 OTel 标准 schema（samples_v2 + time_series_v2），当前 TCP 端口仅监听 127.0.0.1，外部无法访问。

磐石后端运行在独立服务器上，需通过网络连接到 ClickHouse 查询指标数据。

## Goals / Non-Goals

**Goals:**
- 使 ClickHouse TCP 端口可从网络访问（127.0.0.1 → 0.0.0.0）
- 后端通过 `clickhouse-driver` 直连 ClickHouse，查询 OTel schema 中的指标
- 提供 REST API：指标列表、时序数据、最新概览
- 前端展示折线图（时间序列）和数字卡片（最新值）
- 支持指标选择和时间范围切换
- 60s 自动刷新（与 Collector 采集周期对齐）
- 自动刷新在页面不可见时暂停

**Non-Goals:**
- 不修改 esapm Collector 或 Edge 节点的采集配置
- 不修改 ClickHouse 的表结构或数据写入逻辑
- 不做告警/阈值功能
- 不做多 Edge 节点聚合对比（后续可扩展）
- 不做历史数据 TTL 管理（由 ClickHouse 内置 TTL 处理）

## Decisions

### 1. 连接方式：直连 ClickHouse（不经过 esapm）
- **选择**：后端通过 `clickhouse-driver` (Python) 直连 ClickHouse TCP 端口
- **理由**：延迟最低、无需额外中间层；与现有后端直连模式一致（无 Repository 层）
- **备选**：通过 esapm 的 HTTP API 转发 → 增加链路复杂度和延迟

### 2. ClickHouse 端口：TCP 9000 vs HTTP 8123
- **选择**：TCP 9000（原生协议），使用 `clickhouse-driver`
- **理由**：TCP 协议性能更好，支持原生类型、压缩、服务端超时控制；`clickhouse-driver` 是成熟的 Python 客户端
- **备选**：HTTP 8123 → 可以使用 requests，但缺少原生协议的高级特性

### 3. 查询模式：JOIN samples_v2 + time_series_v2
- **选择**：每条查询 JOIN samples_v2 (值) 和 time_series_v2 (标签) ON (metric_name, fingerprint)
- **理由**：OTel schema 将值和标签分离存储，这是标准做法
- **优化**：标签过滤使用 ClickHouse 原生 JSON 函数 `JSONExtractString(labels, 'key') = 'value'`，比 `labels LIKE` 更精确，避免 JSON 特殊字符误匹配

### 4. Counter 处理：计算 rate
- **选择**：Counter 类型指标使用 `(max(value) - min(value)) / time_delta` 计算速率
- **理由**：`edge_http_requests_total` 是单调递增的 counter，原始值无意义，需要转为每秒/每分钟请求数
- **自动判断**：通过 JOIN time_series_v2 检查 `temporality` 字段，`Cumulative` 即为 Counter 类型，自动算 rate；`Unspecified` 即为 Gauge，直接展示原始值
- **边界处理**：bucket 内只有一个数据点时返回 0（无法计算 rate），响应中附带 `sample_count` 字段让前端感知可靠性
- **备选**：直接展示原始值 → 用户无法直观看出流量变化

### 5. 前端图表库：ECharts + vue-echarts
- **选择**：使用 ECharts 5 + vue-echarts 封装组件
- **理由**：项目已有 ECharts 依赖（dashboard 可能使用）；中文文档完善；社区成熟
- **备选**：Chart.js → 功能不够丰富；AntV G2 → 团队熟悉度较低

### 6. 连接池管理
- **选择**：后端启动时创建全局 `Client` 实例，使用 Transport 层 `async` 模式（非阻塞），每个请求复用连接
- **理由**：clickhouse-driver 的 Client 是线程安全的，复用连接避免每次查询建连开销
- **注意**：FastAPI 是异步框架，clickhouse-driver 的同步调用会阻塞事件循环，需使用 `run_in_executor` 或在初始化时用异步模式

### 7. 连接配置方式：YAML 配置文件
- **选择**：在 `backend/app/config/` 下新建 `clickhouse.yaml` 配置文件，存放 ClickHouse 连接参数（host、port、database、user、password）
- **理由**：与项目中 `equivalence_rules.yaml` 等配置方式一致；开发环境默认值可让后端在 ClickHouse 不可用时优雅降级（所有 metrics API 返回空数据）
- **备选**：环境变量 → 需要额外的 .env 加载机制；硬编码 → 无法适配不同环境

### 8. Feature 开关
- **选择**：在 `backend/app/core/features.py` 的 `KNOWN_FEATURES` 中添加 `"metrics"` 特性开关，通过 `features.yaml` 控制启用/禁用
- **理由**：保持与项目中其他功能一致；ClickHouse 可能未就绪时可以先不暴露菜单项
- **行为**：开关关闭时，前端侧边栏不显示"指标监控"菜单；开关开启但 ClickHouse 不可用时，页面显示空数据和提示信息

## Risks / Trade-offs

| 风险 | 缓解措施 |
|---|---|
| **ClickHouse 单点故障**：如果 ClickHouse 不可用，指标页面无数据 | API 返回空数组而非报错，前端显示"数据暂不可用" |
| **查询性能**：JOIN + labels LIKE 在大数据量下可能较慢 | 限制查询时间范围（默认 1h），interval 聚合减小数据量 |
| **网络延迟**：后端到 ClickHouse 的网络往返影响页面加载 | 后端设置查询超时（5s），前端显示 loading 状态 |
| **Counter 数值重置**：Edge 节点重启后 counter 归零，rate 出现负值 | 查询层对负值做 max(0, rate) 处理 |
| **多 Edge 节点**：当前只有 1 个节点，未来多个节点时 labels 维度扩展 | API 设计预留 label 过滤参数，前端后续增加节点选择器 |
| **Counter 单点故障**：bucket 内只有一个采样点时无法计算 rate | 返回 `sample_count=1, value=0`，前端据此显示虚线或提示 |
| **scrape_* 噪音**：Prometheus 内部指标（scrape_duration 等）对用户无意义 | 前端只展示业务指标（edge_* 非 shared_dict），后端 API 不过滤，由前端控制 |
| **ClickHouse 连接泄漏**：长时间运行后连接池枯竭 | 设置连接超时和重连机制；liveness 检查定期 ping |
