## Why

边缘节点页面（EdgeClient）在 `onMounted` 时自动并发发送 6 个请求到后端 `/edge-client/nodes/{ip}/{port}/...` 端点。后端使用同步 `httpx` 库连接 Edge 节点，当节点不可达时，同步 `httpx.get(timeout=30)` 阻塞 asyncio 事件循环。Chrome 每个域名限制 6 个并发连接，6 个挂起请求占满所有连接槽。用户切换到集群管理时，集群 API 请求被阻塞排队，需要等待所有 Edge 请求超时（最多 180s）后才能响应。

## What Changes

- 边缘节点页面去掉自动查询，改为用户手动点击「查询」按钮触发
- 添加「取消查询」按钮，使用 AbortController 中断进行中的请求
- 后端 EdgeClient 超时从 30s 改为 5s
- 后端 `run_edge_sync()` 辅助函数：将同步 httpx 调用通过 `asyncio.to_thread()` 放入线程池执行，避免阻塞事件循环
- 6 个列表端点（upstreams/routes/global_rules/plugin_configs/plugin_metadata/plugins/list）全部改用 `run_edge_sync()` 包装

## Capabilities

### New Capabilities

- `edge-client-manual-query`: 边缘节点页面手动查询模式，用户点击「查询」才加载数据，点「取消查询」中断请求

### Modified Capabilities

- `edge-client`: 后端端点不再阻塞事件循环，支持请求取消

## Impact

- **前端**: `EdgeClient.vue` — 去掉自动查询、添加查询/取消查询按钮、AbortController
- **后端**: `edge_client.py` — 添加 `run_edge_sync()`、6 个端点改为异步执行、超时 5s
- **后端**: `services/edge_client.py` — httpx 超时 30s → 5s
