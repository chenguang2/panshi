## Context

当前迁移 API `POST /database/migrate` 是同步阻塞调用，前端等待完整响应后才显示结果。进度条写死 `:percent="95"`，无真实进度信息。后端 `migrate_direct` 已有 `progress_cb` 回调参数但未接入。

迁移过程涉及 22 张表，每张表行数差异大（从 0 到数万），大库迁移可能耗时数分钟。用户无法判断是卡死还是正常进行中。

## Goals / Non-Goals

**Goals:**
- 迁移过程中实时展示：当前第 N/M 张表、表名、当前表已迁移行数/总行数
- 迁移超时可配置（默认 5 分钟），超时后自动中断并返回错误
- 前端进度条与文字信息同步更新

**Non-Goals:**
- 不做迁移暂停/恢复（当前为一次性操作，复杂度高且场景少）
- 不做迁移速度估算（表大小差异大，ETA 不准反而误导）
- 不改变迁移的核心逻辑（依赖顺序、FK 保留、序列重置等）

## Decisions

### D1: 进度推送采用 SSE（Server-Sent Events）

**选择**：`POST /database/migrate` 改为 `StreamingResponse(media_type="text/event-stream")`

**理由**：
- FastAPI 原生支持 StreamingResponse，无需额外依赖
- SSE 是单向推送的标准方案，比 WebSocket 轻量
- 前端用 `EventSource` 或 `fetch` + `ReadableStream` 即可接收

**替代方案**：
- WebSocket：双向通信，但迁移只需单向推送，过度设计
- 轮询：增加延迟和服务器压力，不如 SSE 实时
- 保留同步响应 + 前端假进度：用户体验无改善

### D2: 进度事件格式

```
event: progress
data: {"type":"table_start","table_index":1,"total_tables":22,"table_name":"sys_user","total_rows":0}

event: progress
data: {"type":"table_progress","table_index":1,"total_tables":22,"table_name":"sys_user","copied_rows":500,"total_rows":1000}

event: progress
data: {"type":"table_complete","table_index":1,"total_tables":22,"table_name":"sys_user","copied_rows":1000}

event: complete
data: {"message":"迁移完成，共迁移 22 张表","tables_migrated":22,"tables":[...],"backup_path":"..."}

event: error
data: {"detail":"迁移超时"}
```

**理由**：事件类型区分让前端可以精确渲染不同阶段（表切换时更新表名，行进度时更新计数器）。

### D3: 超时机制采用协作式取消

**选择**：在 `migrate_direct` 内部通过 `threading.Event` 检查取消信号。路由层用 `asyncio.wait_for` + `asyncio.to_thread` 启动迁移线程，超时后 set event，线程在下一个检查点（每批次/每表开始）发现信号后 raise `MigrationCancelled` 异常退出。

**理由**：
- Python 线程无法被强制 kill，`asyncio.wait_for` 超时只是取消 Future，底层线程继续运行
- 协作式取消让迁移在安全点退出（不会中断半途的 INSERT 事务），数据一致性有保障
- 检查点设在 `_copy_table` 的每批次（BATCH_SIZE=500 行）和每表开始处，延迟最多 500 行的写入

### D4: 前端用 fetch + ReadableStream 替代 EventSource

**选择**：前端用 `fetch` 发请求，通过 `response.body.getReader()` 逐行读取 SSE 数据。

**理由**：
- `EventSource` 只支持 GET，而迁移是 POST 请求
- `fetch` + `ReadableStream` 可以发送 POST body（含迁移参数）
- 手动解析 SSE 文本协议（`event:` / `data:` 行）简单可控

### D5: 超时下拉框选项

**选择**：1 分钟、3 分钟、5 分钟（默认）、10 分钟、30 分钟

**理由**：覆盖从小库秒迁到大库慢迁的场景。30 分钟上限防止用户设过长导致连接断开。

### D6: 行级进度需预查询 total_rows

**选择**：`_copy_table` 开头加 `SELECT COUNT(*) FROM table` 获取源表精确行数。

**理由**：`table_start` 事件需要 `total_rows` 才能显示"已迁移 X/Y 行"。COUNT 在 SQLite/PG 上都很快（全表扫描但只读聚合），比逐行读取时再统计要准确。

### D7: 跳过源库不存在的表并标记

**选择**：`table_start` 事件加 `skipped: boolean` 字段。`_copy_table` 对不存在的表返回 `skipped: true`，`table_start` 事件携带该标记，前端显示"跳过：表不存在"。

**理由**：源库可能缺表（如 test.db），跳过是正常行为。给用户明确信息比闪烁的 0 行进度更友好。

### D8: 备份阶段纳入进度流

**选择**：`export_archive` 增加 `progress_cb` 参数，在每张表备份时回调。SSE 事件增加 `type: "backup"` 类型，前端显示"正在备份源库…"。

**理由**：替换模式下备份是阻塞操作，大库备份可能很慢，用户需要知道当前在哪个阶段。

### D9: SSE 连接断开时协作取消

**选择**：SSE generator 捕获 `ClientDisconnect` 异常，set 取消信号让迁移线程提前退出。

**理由**：前端关闭页面或网络断开后，后端线程不应继续跑完。迁移数据不会丢失（已写入的部分保留在目标库），用户重试时会重新清空。

### D10: 迁移锁在 SSE generator 内管理

**选择**：`maintenance.set_migration_in_progress(True/False)` 在 SSE generator 内部的 try/finally 中设置，而非路由层。

**理由**：StreamingResponse 的 generator 是惰性的——路由函数 return 后才开始执行，路由层的 try/finally 覆盖不到 generator 内部。锁必须跟随实际迁移生命周期。

## Risks / Trade-offs

- **[SSE 连接中断]** → 网络抖动或用户关闭页面导致连接断开。缓解：捕获 `ClientDisconnect` 并 set 取消信号，线程在下一个检查点退出；已写入数据保留在目标库。
- **[协作取消延迟]** → 超时后线程不会立即停止，最多延迟 500 行 + 1 张表的写入。缓解：检查点频率足够高，延迟可接受。
- **[同步阻塞线程]** → `migrate_direct` 在 `to_thread` 中运行，占用一个线程。缓解：迁移是低频操作，线程池有足够余量。
- **[COUNT 查询开销]** → 每张表多一次 COUNT 查询。缓解：COUNT 在有索引的表上极快，22 张表的额外开销可忽略。
- **[向后兼容]** → API 响应类型从 JSON 变为 SSE，旧前端无法兼容。缓解：当前只有一个前端客户端，同步更新即可。
