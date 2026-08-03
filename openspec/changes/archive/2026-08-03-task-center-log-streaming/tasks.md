# Tasks: task-center-log-streaming

## 1. 数据模型与迁移

- [x] 1.1 `backend/app/models/node_task.py`：`NodeTaskItem` 新增 `log_file VARCHAR(255)`、`log_line_count INTEGER`、`stdout_tail TEXT` 三列
- [x] 1.2 `backend/app/core/migrate.py`：`COLUMN_MIGRATIONS` 追加三条（`install_task_node` 的 log_file/log_line_count/stdout_tail），走幂等 `_add_column`
- [x] 1.3 `backend/tests/test_node_task_model.py`：新增测试验证新列默认值与 set/get 行为

## 2. 日志文件存储服务

- [x] 2.1 `node_task_service.py`：新增日志文件工具（路径构造 `task-logs/{task_id}/{node_id}.log`、mkdir parents、追加写、读全量/末尾 N 行、`stdout_tail` 截取 8KB、删除清理）
- [x] 2.2 `_run_item` 改造：`on_log` 改为"追加写文件 + 更新内存 buffer"，不再 `item.set_logs(logs)`；执行期间不 commit 日志
- [x] 2.3 `_run_item` 完成路径：持久化 `log_file`/`log_line_count`/`stdout_tail`/`stdout`（摘要），最终 commit
- [x] 2.4 `_finalize_task` / 取消 / 重试路径：重试时日志文件追加或重建，不丢新行
- [x] 2.5 `backend/tests/test_node_task_service.py`：新增测试——执行期间 on_log 写入文件、完成时 DB 存摘要、log_line_count 正确

## 3. SSE 广播与实时推送

- [x] 3.1 `node_task_service.py`：新增内存广播器（`_subscribers: dict[int, set[asyncio.Queue]]`），`subscribe`/`unsubscribe`/`broadcast` 方法
- [x] 3.2 `on_log` 与状态变化处接入广播：`log_line`/`node_update`/`task_update`/`done` 事件
- [x] 3.3 `node_tasks.py`：重写 `stream_task_events` —— 注册订阅者 → 发当前快照（任务+节点状态）→ 循环推送增量 → `done` 后关闭；`finally` 清理订阅者
- [x] 3.4 `node_tasks.py`：新增 `GET /node-tasks/{task_id}/items/{node_id}/log` 端点（`tail=N` 参数，text/plain；文件不存在回退 stdout）
- [x] 3.5 `_to_item_dict`：返回 `log_file`/`log_line_count`，`stdout` 用摘要；`_to_task_dict` 兼容
- [x] 3.6 `backend/tests/test_node_task_stream.py`（或并入现有测试）：SSE 快照+增量+done、断线清理订阅者、日志读取端点

## 4. 前端实时日志

- [x] 4.1 `useNodeTasks.ts`：新增 `fetchTaskItemLog(taskId, nodeId, tail?)` API 函数
- [x] 4.2 `NodeTaskCenter.vue`：详情弹窗打开时对 running/pending 任务建立 `EventSource('/node-tasks/{id}/stream')`，处理 `log_line`/`node_update`/`task_update`/`done`
- [x] 4.3 `NodeTaskCenter.vue`：日志缓冲区按 node_id 累积行，`NodeTaskLogViewer` 展示实时追加
- [x] 4.4 `NodeTaskCenter.vue`：EventSource `onerror` → 每 2s 轮询 `getNodeTask` 兜底；`done` 后关闭并重拉详情
- [x] 4.5 `frontend/src/views/__tests__/NodeTaskCenter.test.ts`：新增测试——SSE 事件驱动日志追加、断线轮询兜底

## 5. 验证与收尾

- [x] 5.1 后端：`uv run pytest` 全部通过（含新增测试）
- [x] 5.2 前端：`npx vitest run` 相关测试 + `npm run build`（vue-tsc）通过
- [x] 5.3 Playwright 实测：创建安装任务 → 详情页实时看到编译日志滚动 → 完成后日志可从文件读取
- [x] 5.4 同步 `openspec/specs/node-task-center/spec.md` 与新增 `openspec/specs/task-log-file-storage/spec.md`（main specs）
