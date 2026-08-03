# Design: task-center-log-streaming

## Context

节点任务中心（`node-task-center`，已归档）实现了持久化任务引擎：`NodeTaskService` 后台执行，`install_task`/`install_task_node` 表持久化任务与逐节点子任务。当前存在三个缺陷：

1. **执行期间日志不落库**：`_run_item` 中的 `on_log` 回调只更新内存中的 SQLAlchemy 对象（`item.set_logs(logs)`），从不 `db.commit()`。执行期间 DB 里 `logs=[]`、`stdout=NULL`。
2. **SSE 是空壳**：`GET /node-tasks/{task_id}/stream` 只 yield 一个 `connected` 事件后 `while True: await asyncio_sleep(2)` 空转，不推送任何真实事件。前端也没有 `EventSource` 连接。
3. **大日志冗余入 DB**：实测一次 `install_openresty` 编译输出 **3.7MB/节点**，被同时写入 `logs` 与 `stdout` 两列（7.5MB 冗余）。若按"每行日志写 SQLite"修复，SQLite 单写者锁 + 写放大无法承受。

约束：SQLite（开发）/PostgreSQL（生产）；直接修改现有 `node_task_service.py`/`node_tasks.py`/`NodeTaskCenter.vue`；不引入新依赖。

## Goals / Non-Goals

**Goals:**
- 执行期间日志实时可见（详情页看到编译输出在跑）
- 完整日志持久化，但**不写入 SQLite**——落文件系统
- DB 只存摘要（stdout_tail / log_line_count / log_file 路径 / rc / 状态 / 时间）
- SSE 真实推送 `task_update` / `node_update` / `log_line` / `done`，前端 `EventSource` 消费
- 断线/历史查看以轮询详情兜底（符合既有 spec 要求）

**Non-Goals:**
- 不改动既有的单节点 SSE 端点（`install_edge_stream`、`edge_pack_add_stream` 等，走 `_run_ansible_stream` 的那批）——它们本就实时且不落库，行为不变
- 不做 WebSocket、不做多进程/多实例间的跨进程广播（本部署为单进程 uvicorn）
- 不迁移历史旧任务数据（旧行 stdout 已是全量，保持原样可读）
- 不实现"进度百分比"前端动画（现有 progress 逻辑保留）

## Decisions

### D1: 日志落文件系统，DB 只存摘要

**决定**：每个任务子项一个日志文件 `backend/data/task-logs/{task_id}/{node_id}.log`，追加写入。`install_task_node` 新增三列：

| 列 | 类型 | 说明 |
|---|---|---|
| `log_file` | `VARCHAR(255)` | 相对路径 `task-logs/{task_id}/{node_id}.log` |
| `log_line_count` | `INTEGER` | 已写入行数（用于断点续传） |
| `stdout_tail` | `TEXT` | 末尾 N KB 摘要（默认 8KB），便于详情页快速预览 |

`logs` / `stdout` / `stderr` / `command` 列**保留**但语义调整：执行期间不再写入全量大对象；`stdout` 只写摘要尾部（与 `stdout_tail` 一致，兼容旧前端字段），`logs` 保持空。

**理由**：文件 IO 对 3.7MB 追加写天然高效（O(1) 追加），磁盘便宜；SQLite 是业务库，混入 GB 级日志会拖垮备份/查询/VACUUM。`stdout_tail` 让详情页不读文件也能看到结尾内容（用户最常看的部分）。

**备选**：A. 每行日志写 DB —— 否决，SQLite 单写者 + 写放大。B. 日志全存内存 —— 重启丢失、内存占用不可控。

### D2: 单进程内存广播器（pub/sub）

**决定**：`NodeTaskService` 内新增一个轻量广播器：

```python
# 每个运行中任务维护一组订阅者的 asyncio.Queue
_subscribers: dict[int, set[asyncio.Queue]]
# 事件格式（dict，序列化为 SSE data: 行）
#   {"type": "log_line", "task_id": ..., "node_id": ..., "line": "..."}
#   {"type": "node_update", "task_id": ..., "node_id": ..., "status": "running"|"success"|"failed", "rc": ...}
#   {"type": "task_update", "task_id": ..., "status": "running"|"success"|"failed"|"partial", "success_nodes": ...}
#   {"type": "done", "task_id": ...}
```

- `_run_item` 的 `on_log` 回调：**写文件 + 广播到所有订阅者队列**（`queue.put_nowait`），不再碰 DB
- `_run_item`/`_finalize_task` 状态变化时广播 `node_update`/`task_update`/`done`
- `stream_task_events` 端点：注册订阅者 → 先发送当前快照（任务+全部节点状态）→ 循环读取订阅者队列 → 序列化为 SSE 行；客户端断开时清理订阅者（`finally` 中 remove）

**理由**：单进程 uvicorn 部署下，内存队列广播是最简单可靠的实时通道；事件即时、零 DB 压力。`put_nowait` 到有界队列（容量 1000），订阅者消费不及时则丢弃最旧（日志查看器以行追加，丢行可接受，文件里有完整记录）。

**备选**：A. 轮询 DB 差异推送 —— 要维护游标、有延迟。B. 每个订阅者读文件 tail —— 并发读文件 + 游标管理复杂。

### D3: SSE 先快照后增量

**决定**：SSE 连接建立后：
1. 先发 `task_update`（当前任务状态）+ 每个节点的 `node_update`（当前状态/rc）+ 已写日志行的尾部摘要
2. 然后持续推送 `log_line` 增量
3. 任务结束后发 `done`，服务端关闭流

**理由**：符合 spec"断开后重连从当前状态继续"；EventSource 自动重连时能立刻看到当前状态而不丢上下文。

### D4: 前端 EventSource + 断线轮询兜底

**决定**：`NodeTaskCenter.vue` 详情弹窗打开时：
1. `getNodeTask(id)` 拉一次全量详情（含 `stdout_tail` 快照）
2. 若任务状态为 `pending`/`running` → 建立 `EventSource('/node-tasks/{id}/stream')`：
   - `log_line` → 追加到对应节点的日志缓冲区
   - `node_update`/`task_update` → 更新状态显示
   - `done` → 关闭 EventSource，重新拉详情
3. EventSource `onerror`（断线）→ 每 2s 轮询 `getNodeTask` 兜底，直到重连成功或任务结束

**理由**：SSE 是主通道（实时），轮询是兜底（可靠性），两者互补；复用现有 `parseTaskEvent`。

### D5: 日志文件安全与清理

**决定**：
- 写文件使用 `aiofiles` 或异步追加？——**不加依赖**，用 `asyncio.to_thread` + 标准 `open(path, "a")`，日志写入频率不高（SSE 行级，但可批量合并：每收到行追加到内存 buffer，每 0.5s 或 200 行 flush 一次）
- 路径安全：`task_id`/`node_id` 均为 int，`Path(f"task-logs/{task_id}/{node_id}.log")`，`mkdir(parents=True, exist_ok=True)`
- 清理：任务完成后文件保留（历史可查）；提供按任务删除时的级联清理（`NodeTaskItem` CASCADE 删除时同步删文件）——本次仅在删除任务 API 处顺手清理（如已有删除 API 则挂上，否则留 TODO）

### D6: API 响应兼容

**决定**：`_to_item_dict` 返回字段保持既有名称（`logs`/`stdout`/`stderr`/`command`）以兼容前端 `NodeTaskLogViewer`，新增 `log_file`/`log_line_count`。`stdout` 值改为 `stdout_tail` 内容。详情页完整日志通过新增端点读取：

```
GET /node-tasks/{task_id}/items/{node_id}/log?tail=0   # 0=全量，N=末尾 N 行
```

返回纯文本（`text/plain`）。前端"查看完整日志"按钮跳转或内嵌加载。

## Risks / Trade-offs

- **[SSE 连接数增长]** → 每个打开的详情页一个长连接；单进程可承受数百并发，超出时前端 `onerror` 自动降级为轮询，功能不丢失。
- **[日志文件无限增长]** → 单文件最大取决于任务类型（install 约 4MB/节点），运维类任务日志很小；文件数 = 任务数×节点数，可按需加定期清理（本次不做，留 TODO）。
- **[事件丢失（订阅者消费慢）]** → 有界队列丢最旧行，文件是完整真相；前端断线重连后从 `stdout_tail` 恢复，可接受。
- **[多实例部署不适用]** → 当前为单进程 uvicorn（`start.sh`/systemd 单实例）；若未来多实例，SSE 需改 Redis pub/sub（本次明确 Non-Goal）。
- **[列迁移失败风险]** → 新增列用 `COLUMN_MIGRATIONS` 的 `_add_column` 幂等机制（已存在则跳过），SQLite/PostgreSQL 均支持 `ADD COLUMN`，低风险。
- **[旧前端字段语义变化]** → `stdout` 从"全量"变"尾部摘要"；详情页新端点提供全量，前端需同步改造（本变更内完成）。

## Migration Plan

1. 代码变更一次部署（后端 + 前端）
2. 启动时 `run_migrations()` 自动为 `install_task_node` 加 `log_file`/`log_line_count`/`stdout_tail` 列（幂等）
3. 旧历史任务行：`stdout` 已有全量数据，前端 `NodeTaskLogViewer` 仍能显示（`stdout` 优先于 `logs` 分支已存在）；`log_file` 为 NULL 时详情页走"文件不存在则显示 stdout"分支
4. 回滚：SSE/文件逻辑在服务端，前端回退即可；DB 新列无害（NULL 可容忍）

## Open Questions

- 删除任务 API 是否已存在？（决定文件清理挂载点）——实现时检查 `node_tasks.py` 是否有 DELETE 端点。
- 是否需要在任务中心页提供"下载完整日志"？（当前设计仅详情弹窗内嵌查看，够用）
