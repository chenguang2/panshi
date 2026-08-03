# task-center-log-streaming

## Why

节点任务中心当前存在两个缺陷：一是任务执行期间日志从未持久化到数据库（`on_log` 只改内存对象不 commit），导致详情页打开时 stdout/logs 全为空、显示"无输出"；二是 `GET /node-tasks/{task_id}/stream` 是一个只发 `connected` 后死循环的空壳，未按 spec 推送任何实时事件。同时，一次 `install_openresty` 的编译输出实测达 **3.7MB/节点**（被冗余存储于 logs 与 stdout 两处），若按"每行日志写 SQLite"的方式修复，会造成写放大与单写者锁争用，SQLite 无法承受。

## What Changes

- **日志落文件**：任务子任务的完整日志改为追加写入 `backend/data/task-logs/{task_id}/{node_id}.log` 文件（含 ansible 输出与 SSH 编译输出），不再整段冗余写入数据库。
- **DB 只存摘要**：`install_task_node` 不再存全量 `logs`/`stdout`/`stderr`，改为存 `stdout_tail`（末尾 N KB 摘要，便于快速预览）、`log_file` 路径、`log_line_count`、`rc`、状态与起止时间。
- **SSE 实时推送**：实现真实的 `GET /node-tasks/{task_id}/stream`，执行期间推送 `task_update` / `node_update` / `log_line` / `done` 事件；前端用 `EventSource` 连接，实时追加日志行。
- **前端轮询兜底**：SSE 断线/重连时以轮询详情 API 兜底，保证不丢状态（符合既有 spec"以轮询详情兜底"要求）。
- **`_run_item` 日志回调改造**：`on_log` 由"改内存对象"改为"写文件 + 推 SSE 队列"，执行期间 DB 仅更新状态与统计，不做大对象写库。

## Capabilities

### New Capabilities

- `task-log-file-storage`: 节点任务日志的文件持久化能力——日志按任务/节点追加写入磁盘文件，DB 只保存摘要与文件路径，支持按文件读取历史日志。

### Modified Capabilities

- `node-task-center`: SSE 实时推送要求从"空壳 stub"升级为真实事件推送（`task_update`/`node_update`/`log_line`/`done`）；日志持久化要求从"追加到子任务 logs 字段"改为"写入日志文件 + DB 存摘要"。

## Impact

- **后端**：
  - `backend/app/services/node_task_service.py` — `_run_item`/`on_log` 改造、SSE 事件广播、日志文件写入
  - `backend/app/api/v1/node_tasks.py` — `stream_task_events` 从空壳改为真实推送；`_to_item_dict` 返回摘要字段
  - `backend/app/models/node_task.py` — `NodeTaskItem` 新增 `stdout_tail`/`log_file`/`log_line_count` 列
  - `backend/app/core/migrate.py` — 新增列迁移
  - `backend/app/services/ansible_service.py` — 复用 `_run_ansible_stream` 的 queue + event_handler 模式（不改动，仅参照）
- **前端**：
  - `frontend/src/composables/useNodeTasks.ts` — 新增 SSE 连接/事件解析
  - `frontend/src/views/NodeTaskCenter.vue` — 详情弹窗接入 EventSource 实时日志 + 断线轮询兜底
  - `frontend/src/components/NodeTaskLogViewer.vue` — 支持流式追加日志
- **数据**：`install_task_node` 表结构变更（新增 3 列，语义调整）；新增 `backend/data/task-logs/` 目录
- **测试**：后端 `test_node_task_service.py`/`test_node_task_model.py`、前端 `NodeTaskCenter.test.ts` 相应更新
- **不涉及**：既有的单节点 SSE 端点（install-edge-stream 等）不受影响；`openspec/specs/node-task-center/spec.md` 需要同步更新
