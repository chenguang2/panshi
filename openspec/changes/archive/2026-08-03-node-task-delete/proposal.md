# node-task-delete

## Why

节点任务中心当前缺失"删除"能力：任务一旦创建只能取消/重试，无法移除。运维操作记录（安装/升级/启动等）是一次性操作，历史价值随时间衰减，但 DB 记录与日志文件只进不出——实测 19 个任务已占 8.1MB 日志文件。失败/误操作/试验任务堆积会污染任务列表、占用磁盘，任务生命周期（创建 → 执行 → 取消/重试 → 删除）缺最后一环。

## What Changes

- **后端硬删除端点**：`DELETE /node-tasks/{task_id}` 删除单个任务；`POST /node-tasks/batch-delete`（body 含 `task_ids`）批量删除
- **级联清理**：删除任务时级联删除 `install_task_node` 子任务记录（依赖现有 FK `ON DELETE CASCADE`），并清理对应日志文件目录 `task-logs/{task_id}/`（复用 `task_log_store.delete_task_logs`）
- **终态保护**：仅终态任务（success/failed/partial/cancelled）可删除；running/pending 任务删除返回 409 冲突，需先取消
- **前端多选删除**：任务列表增加行选择（checkbox）与"批量删除"操作；单行删除按钮（仅终态显示）
- **系统风格确认框**：复用 `showDeleteConfirm` 同款自定义 modal（红色警示 + 确认/取消），描述删除影响（DB 记录 + 日志文件）
- **列表实时联动**：删除后刷新列表、停止相关轮询/SSE（若有）

## Capabilities

### New Capabilities

- `node-task-deletion`: 节点任务的硬删除能力——单删/批量删除、终态保护、级联清理子任务记录与日志文件。

### Modified Capabilities

- `node-task-center`: 任务化 API 要求新增删除场景（单删 + 批量删除）；取消与并发保护 requirement 增加"运行中任务删除前须取消"约束。
- `task-log-file-storage`: 文件生命周期要求新增"任务删除时清理日志文件目录"场景（既有 `delete_task_logs` 工具接入删除端点）。

## Impact

- **后端**：
  - `backend/app/api/v1/node_tasks.py` — 新增 `DELETE /{task_id}` 与 `POST /batch-delete` 端点；删除前校验终态、级联删 items、调 `task_log_store.delete_task_logs`
  - `backend/app/services/task_log_store.py` — 复用既有 `delete_task_logs`（无需改动，或补充目录清理兜底）
  - `backend/tests/test_node_task_delete.py`（新）— 单删、批量删、终态保护、日志清理、404/409
- **前端**：
  - `frontend/src/composables/useNodeTasks.ts` — 新增 `deleteNodeTask` / `batchDeleteNodeTasks` API 函数
  - `frontend/src/views/NodeTaskCenter.vue` — 表格行选择 + 批量删除栏 + 单行删除按钮 + 系统风格确认框
  - `frontend/src/views/__tests__/NodeTaskCenter.test.ts` — 删除确认、多选、批量删除测试
- **数据**：`install_task` 删除即物理删除（硬删除）；日志目录 `task-logs/{task_id}/` 同步移除
- **不涉及**：无 DB schema 变更（复用现有 FK CASCADE）；不影响详情/日志查看等既有功能
