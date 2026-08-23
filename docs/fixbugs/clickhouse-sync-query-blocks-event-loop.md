# ClickHouse 同步查询阻塞事件循环导致全站请求卡顿

## 现象

系统运行缓慢：点击左侧菜单的**任何一个**链接都要反应数秒。此时平台使用本地 SQLite（`manual-demo.db`），且只有单用户，按理不应如此。用户怀疑"是不是有什么多余的循环"。

## 排查过程

逐层测量定位慢在哪一层：

1. **后端 API 计时**：核心端点全部毫秒级（clusters 13ms、users 3.5ms），唯独 ClickHouse 相关端点异常且持续恶化——`metrics/names` 从 1.3s 涨到 2.25s，`metrics/summary` 达 **6.2~7.3s**。
2. **浏览器整页加载计时**：所有路由 ~350ms，不慢。
3. **干净浏览器侧边栏点击计时**：24~103ms，也不慢——说明卡顿是**周期性**的，恰好被测量窗口错过。
4. **进程资源**：uvicorn 进程持续 **33.7% CPU**（空闲单用户系统不该如此）。
5. **决定性实验**：后台发起一次 `/metrics/summary`（CH 慢查询），立刻测 normally-13ms 的 `/api/v1/clusters`：

```text
CH 查询进行中 clusters -> 5.451s   ← 被拖慢 400 倍
CH 查询结束后 clusters -> 0.015s
```

## 根因

三个因素叠加：

1. **同步阻塞调用进了异步处理器**：`clickhouse_driver.Client` 是同步库，`execute_query()` 在 `async def` 处理器中被直接调用。一次查询执行期间，**整个 asyncio 事件循环被冻结**，所有其他请求（包括毫秒级的 SQLite 端点）只能排队。
2. **ClickHouse 是远端主机**（192.168.100.42），且采集器数据持续累积，查询从毫秒级恶化到秒级。
3. **指标页 60 秒自动刷新**：每次并发约 10 个 CH 查询（时间序列 ×6、summary、路由统计、状态分析等），形成每隔一分钟出现一次、持续数秒的全局卡顿窗口。

## 解决方案

metrics API 的全部 7 个处理器，把同步服务调用包上 `asyncio.to_thread`，将慢查询移入工作线程，事件循环保持畅通：

```python
# 修复前：阻塞事件循环
data = query_summary()

# 修复后：在线程池中执行，循环不被阻塞
data = await asyncio.to_thread(query_summary)
```

涉及 `backend/app/api/v1/metrics.py`：`query_metric_names` / `query_summary` / `query_connection_states` / `query_time_series` / `query_route_stats` / `query_status_analysis` / `query_time_comparison` / `query_node_health`。

## 回归防护

新增事件门控回归测试 `test_metrics_api.py::TestMetricsAPINonBlocking`：

- mock `execute_query` 为带门控的慢函数（`started` 置位后等待 `release`）；
- summary 进入慢查询后才发起 `/health`，从同一起点计时；
- 若事件循环被阻塞，`/health` 只能等阻塞结束才被处理（耗时 ≈ 门控时长）→ 断言失败；
- 修复前该测试失败，修复后通过。

> ⚠️ 编写此类测试的陷阱：不能用主协程里的阻塞等待（如 `threading.Event.wait`）等任务进入慢查询——那会冻结事件循环导致任务永远无法启动。必须用 `await asyncio.sleep()` 轮询让出循环。

## 验证结果

| 项目 | 修复前 | 修复后 |
|---|---|---|
| CH 慢查询期间 clusters | 5.451s | **12~25ms** |
| 回归测试 | 失败 | 通过 |
| 全量后端测试 | — | 1281 passed |

## 经验约定

- **新增任何触碰 ClickHouse 的接口，服务调用必须包 `asyncio.to_thread`**，否则会复现全站排队。
- ClickHouse 客户端本身仍是同步库、查询仍需数秒（指标页自身加载数据依旧偏慢）；若需进一步提速，可选方向：metric names 结果缓存、拉长前端自动刷新间隔、排查 CH 端数据量与网络。

## 后续：前端请求无限堆叠（同一次卡顿的第二根因）

事件循环修复上线后用户仍反馈冻结：在「指标查询 ↔ 指标总览」间快速来回切换数次后，
界面停在"加载中"，点其它链接无响应。

### 根因

两个指标页的 store **没有单飞守卫**：每次进入页面都无条件发起整批慢查询
（总览约 10 个、查询页 3 个），单个请求耗时 2~7 秒。快速来回切换时请求无限堆叠
（实测峰值 17 个并发在途）：

- 浏览器对同源仅允许约 6 个并发连接，堆叠的超额请求把连接池占满；
- 后端线程池（默认执行器）也被多秒级 CH 查询占满，后续 to_thread 排队。

两者叠加 → 新页面的任何数据请求都长时间排队 → 表现为"点其它链接也不动了"。

### 解决方案

| 位置 | 改动 |
|---|---|
| `stores/metricsDashboard.ts` | `loadAllCharts` / `loadInfraCharts` 加单飞守卫（in-flight 标志，加载中跳过重复调用） |
| `stores/metrics.ts` | `loadChartData` / `loadSummary` 同上；`loadMetricNames` 增加缓存（列表变化少，避免每次进页打 2s+ 慢查询） |
| `MetricsDashboard.vue` / `Metrics.vue` | 卸载竞态防护：初始加载 await 数秒期间离开页面时，`onUnmounted` 的 stop 先于定时器创建执行；加载完成后用 `disposed` 标志阻止启动孤儿定时器 |

### 效果

| 指标 | 修复前 | 修复后 |
|---|---|---|
| 来回切 6 次后在途请求 | 14（持续累积） | 12（有界，不随切换次数增长） |
| 峰值并发 | 17 | 12~15 |
| 切换后点击其它页面恢复 | 长时间"加载中" | ~74ms 网络空闲 |

剩余 12 并发是单次仪表盘加载的固有宽度；若需进一步压缩，可合并指标端点或减少图表数量。
