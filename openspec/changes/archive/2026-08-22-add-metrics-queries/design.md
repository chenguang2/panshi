## Context

当前系统已将指标数据从旧表（samples_v2/time_series_v2）迁移到 OTel 新表（otel_metrics_gauge/otel_metrics_sum/otel_metrics_histogram）。新表结构支持更丰富的标签维度（如 route、code、type 等），但现有的 metrics_service.py 仅实现了基础的查询功能，未充分利用这些新维度。

用户通过 DBeaver 执行 SQL 查询发现需要以下统计功能：
1. 路由维度的 QPS、带宽、错误率统计
2. HTTP 状态码分类分析
3. 时间维度对比分析
4. 节点健康状态监控

## Goals / Non-Goals

**Goals:**
- 新增路由维度流量统计 API，支持 QPS、带宽、错误率、延迟排行
- 新增 HTTP 状态码分类统计，支持 2xx/3xx/4xx/5xx 分组
- 新增时间对比分析，支持今日/昨日环比、按小时分布
- 新增节点健康状态监控
- 前端新增对应的展示组件
- 所有查询使用 OTel 新表（otel_metrics_sum、otel_metrics_histogram、otel_metrics_gauge）

**Non-Goals:**
- 不修改现有 API 接口签名和返回格式
- 不涉及 otel_metrics_exponential_histogram 表（当前无数据）
- 不修改 ClickHouse 表结构
- 不新增外部依赖

## Decisions

### 1. 路由 QPS 数据源选择

**选择**：使用 `otel_metrics_sum` 表中的 `edge_http_status` 指标计算路由 QPS

**理由**：
- `edge_http_requests_total` 只有 `ip` 标签，无路由维度
- `edge_http_status` 有完整的 `route`、`code`、`matched_uri` 标签
- 通过 `(max(Value) - min(Value)) / 时间差` 计算速率

**备选方案**：
- 修改 Edge 指标上报配置，为 `edge_http_requests_total` 添加路由标签 → 需要修改 Edge 网关配置，不在本次范围内
- 使用 `otel_metrics_histogram` 表的 `edge_http_latency` → 有路由标签但无法直接计算 QPS

### 2. 状态码分类实现方式

**选择**：在 SQL 中使用 CASE WHEN 表达式实现 2xx/3xx/4xx/5xx 分组

**理由**：
- ClickHouse 支持 CASE WHEN 语法
- 无需修改数据存储结构
- 灵活支持自定义分类规则

**备选方案**：
- 在应用层实现分类逻辑 → 增加网络传输和应用层处理开销

### 3. API 端点设计

**选择**：新增 4 个独立 API 端点

| 端点 | 说明 |
|---|---|
| `GET /api/v1/metrics/route-stats` | 路由维度流量统计 |
| `GET /api/v1/metrics/status-analysis` | HTTP 状态码分析 |
| `GET /api/v1/metrics/time-comparison` | 时间对比分析 |
| `GET /api/v1/metrics/node-health` | 节点健康状态 |

**理由**：
- 职责单一，每个端点专注于一种统计类型
- 便于前端按需调用
- 避免单个端点返回数据过多

**备选方案**：
- 合并为单个 `/api/v1/metrics/advanced` 端点 → 职责不清晰，参数复杂

### 4. 前端展示组件设计

**选择**：新增独立的统计卡片和图表组件

**理由**：
- 与现有指标查询页面解耦
- 可复用于仪表盘展示
- 支持按需加载

## Risks / Trade-offs

| 风险 | 缓解措施 |
|---|---|
| **edge_http_requests_total 缺失路由标签** | 使用 edge_http_status 替代，但需注意数据来源差异 |
| **状态码分类百分比计算可能除零** | 添加 HAVING total_requests > 0 条件过滤 |
| **环比对比可能跨天数据不完整** | 添加时间范围验证，确保完整时间段数据 |
| **节点健康状态依赖 up 指标** | 添加 last_seen 时间检查，避免显示过期数据 |
| **路由 QPS 冷启动时显示为 0** | 在响应中添加 sample_count 字段，前端可据此判断"数据不足" |
| **非标准状态码处理** | 将非标准状态码归类为"其他"，保持图表整洁 |
| **ClickHouse 查询失败** | 返回 200 + 空数据 + error 字段，前端优雅降级 |
| **API 参数验证** | type 参数必须有效（返回 400），since/limit 使用默认值 |
| **查询性能** | 添加 30 秒短期缓存，减少 ClickHouse 压力 |

## Edge Cases

### 1. 路由 QPS 冷启动
- **场景**：新路由刚开始上报数据，只有 1 个数据点
- **当前行为**：`max - min = 0`，QPS 显示为 0
- **解决方案**：响应中添加 `sample_count` 字段，前端可显示"数据采集中"

### 2. 状态码分类
- **场景**：出现非标准状态码（如 0、999、unknown）
- **当前行为**：CASE WHEN 无法匹配
- **解决方案**：将非标准状态码归类为"其他"

### 3. 时间对比数据缺失
- **场景**：凌晨时段数据上报间隔不固定
- **当前行为**：`max - min` 可能低估实际请求量
- **解决方案**：添加 `data_quality` 字段（complete/partial），前端显示"数据仅供参考"

### 4. 路由延迟类型选择
- **场景**：用户需要查看不同阶段的延迟（upstream、edge 等）
- **当前行为**：只返回 request 类型
- **解决方案**：添加 `latency_type` 参数，默认返回 request，可选其他类型

### 5. 资源使用率展示
- **场景**：用户只看到原始字节数，难以理解使用情况
- **当前行为**：返回 capacity_bytes 和 free_bytes
- **解决方案**：同时返回原始值和 usage_percent

### 6. 空数据处理
- **场景**：新部署或数据未上报时查询
- **当前行为**：返回空数组，用户无法区分"没有数据"和"查询出错"
- **解决方案**：返回 200 + 空数据 + warning 字段

### 7. ClickHouse 不可用
- **场景**：ClickHouse 连接失败或查询超时
- **当前行为**：返回 500 错误
- **解决方案**：返回 200 + 空数据 + error 字段，前端优雅降级
