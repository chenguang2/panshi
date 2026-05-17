## Context

EdgeClient 页面使用同步 httpx 库连接 Edge 节点，在 FastAPI async handler 中直接调用会阻塞整个事件循环。当 Edge 节点不可达时，6 个并发请求串行阻塞，导致浏览器连接耗尽，其他页面（如集群管理）无法正常请求。

## Goals / Non-Goals

**Goals:**
- 边缘节点页面不做自动查询，用户手动触发
- 支持取消进行中的查询
- 后端 Edge 请求不阻塞事件循环
- 集群管理页面不受边缘节点页面影响

**Non-Goals:**
- 不重构整个 EdgeClient 为异步（30+ 方法改动太大）
- 不改动边缘节点的 CRUD 端点（只改列表查询端点）

## Decisions

### Decision 1: AbortController 实现查询取消

前端使用 AbortController，每次查询创建新 controller，取消时调用 abort()。

### Decision 2: asyncio.to_thread 代替全量异步重构

将同步 httpx 调用放入线程池执行，避免阻塞事件循环，同时支持 FastAPI 的请求取消机制。

### Decision 3: 超时缩短到 5s

Edge 节点连接的 httpx timeout 从 30s 改为 5s，配合线程池方案，不可达时快速失败。

## Risks / Trade-offs

| 风险 | 缓解 |
|---|---|
| asyncio.to_thread 创建线程开销 | 6 个请求最多 6 个线程，可接受 |
| 线程内 httpx 无法被 FastAPI 取消 | 5s 超时确保最多等 5s |
| 取消后线程仍在运行 | 线程内 httpx 完成即释放，不影响事件循环 |
