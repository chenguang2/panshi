## Context

当前 Ansible 执行是完全同步阻塞的：`AnsibleRunnerService.run_playbook()` 通过 `asyncio.to_thread()` 调用 `ansible_runner.run()`，整个 playbook 完成前不返回任何数据。前端用 `setInterval` 伪造进度条（脉冲到 65% 后跳到 100%）。

安装 OpenResty（约 5-10 分钟）不能套用此模式。需要真正的实时流式传输，让用户看到每行安装日志。

Ansible playbook task `install_openresty.yml` 和 `install_edge.yml` 已存在，tag 分别为 `install_openresty` 和 `install_edge`，但尚未注册到后端 `ALLOWED_TAGS`，也无 API 入口。

## Goals / Non-Goals

**Goals:**
- 后端注册 `install_openresty`、`install_edge` 两个 tag 到 `ALLOWED_TAGS`
- `AnsibleRunnerService` 新增对应的安装方法
- 新增 SSE streaming 端点，实时流式返回 ansible 输出
- 前端支持流式日志展示（逐行追加，而不是一次性渲染）

**Non-Goals:**
- 不引入 WebSocket（单向 SSE 足够）
- 不涉及安装任务取消（首批不实现）
- 不修改现有的 nginx_cmd / statistic 等短任务执行方式
- 不新增数据库表（安装日志不持久化）

## Decisions

### 1. SSE 方案：使用 FastAPI StreamingResponse + ansible-runner event_handler

后端新增端点返回 `StreamingResponse`，内部用异步生成器逐行 yield SSE 格式事件。

```
@router.post("/{cluster_id}/nodes/{node_id}/install-openresty")
async def install_openresty_stream(...):
    return StreamingResponse(
        _run_ansible_stream(node, tag, extravars),
        media_type="text/event-stream",
    )
```

`_run_ansible_stream()` 异步生成器：
1. 创建 `threading.Queue`（同步），放入 `_SENTINEL` 作为结束标记
2. 定义 `event_handler` 回调：将每行 stdout 写入 `queue.put(line)`
3. 用 `asyncio.to_thread()` 启动 `ansible_runner.run(event_handler=event_handler)`
4. 主协程轮询 `queue.get()`，读到 `_SENTINEL` 时结束
5. 每行 yield 为 SSE 格式事件：`data: {"line": "...", "percent": N}\n\n`
6. playbook 完成后 yield 最终结果事件（含 rc、status）

### 2. 前端：fetch + ReadableStream 替代 api.post

EventSource 不支持 POST，改用 `fetch` 发送 POST 请求，通过 `response.body.getReader()` 流式读取 SSE 响应。

```
const response = await fetch(url, { method: 'POST', headers, body })
const reader = response.body!.getReader()
const decoder = new TextDecoder()
while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const text = decoder.decode(value)
    // 按行解析 SSE 事件: data: {...}\n\n
    for (const line of text.split('\n')) {
        if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6))
            appendLog(data.line)
            updateProgress(data.percent)
        }
    }
}
```

`NodeExecutionResultDrawer` 改造为支持两种模式：
- `mode="streaming"`: 从 EventSource 持续接收行，逐行追加到 `logs` 数组
- `mode="static"`: 现有模式，一次性接收全部结果

### 3. 不新增 Python SSE 依赖

直接使用 `starlette.responses.StreamingResponse`（FastAPI 已内置），不需要 `sse-starlette`。SSE 格式只需手动构造 `data: {...}\n\n` 字符串。

### 4. 安装端点定位

安装是**节点级操作**，放在 `cluster_nodes.py` 中，和现有 start/stop/statistic 同级。

### 5. ALLOWED_TAGS 仅用于 generic_run 端点

`install_openresty` 和 `install_edge` 不注册到 `ALLOWED_TAGS`（避免通用接口滥用），而是走专用的 streaming 端点。

## Risks / Trade-offs

- [SSE 连接上限] 浏览器单域名最多 6 个 SSE 连接，安装操作并发少，不影响
- [连接中断] SSE 自动重连，重连后前端可继续接收日志
- [长时间运行] FastAPI 的 StreamingResponse 无超时，SSE 连接可保持 10+ 分钟
- [日志行数] 编译输出可能数千行 → 前端限制最大显示 500 行，超出丢弃旧行。后端仍保留完整日志供下载
- [性能] 每行日志 yield 一次，无内存堆积风险
