# Tasks: node-task-delete

## 1. 后端删除端点

- [x] 1.1 `node_tasks.py`：新增 `DELETE /node-tasks/{task_id}` 单删端点——查任务存在（404）、校验终态（409）、`db.delete(task)` 级联删 items、`task_log_store.delete_task_logs(task_id)` 清日志、返回 `{"deleted": [id]}`
- [x] 1.2 `node_tasks.py`：新增 `POST /node-tasks/batch-delete` 批量端点——body `{"task_ids": []}`，逐个校验终态/存在，删终态跳过运行中，返回 `{"deleted": [], "skipped": []}`
- [x] 1.3 `backend/tests/test_node_task_delete.py`（新）：单删成功（含 items 级联 + 日志清理）、404、409 运行中、批量删混合（deleted/skipped）、批量全运行中

## 2. 前端 API 层

- [x] 2.1 `useNodeTasks.ts`：新增 `deleteNodeTask(taskId)` → `api.delete('/node-tasks/{id}')`
- [x] 2.2 `useNodeTasks.ts`：新增 `batchDeleteNodeTasks(taskIds)` → `api.post('/node-tasks/batch-delete', { task_ids })`

## 3. 前端列表多选与删除

- [x] 3.1 `NodeTaskCenter.vue`：`a-table` 启用 `rowSelection`，新增 `selectedRowKeys` state；选中时工具栏显示"批量删除（N）"按钮
- [x] 3.2 `NodeTaskCenter.vue`：单行操作列加"删除"按钮（`v-if` 终态才显示，running/pending 不显示）
- [x] 3.3 `NodeTaskCenter.vue`：删除确认框——复用系统自定义 modal 模式（`h`+`render`，同 `showDeleteConfirm` 风格），红色标题 + "将删除 N 个任务的数据库记录及其日志文件，不可恢复"，确认/取消
- [x] 3.4 `NodeTaskCenter.vue`：删除成功后 `loadTasks` 刷新 + `selectedRowKeys` 清空；若删除的是当前详情/轮询任务则 `stopStream`
- [x] 3.5 `frontend/src/views/__tests__/NodeTaskCenter.test.ts`：新增测试——单行删除按钮仅终态显示、批量删除确认框、删除后调 API 并刷新

## 4. 验证与收尾

- [x] 4.1 后端：`uv run pytest` 相关测试通过（含新 delete 测试；既有 2 个预失败除外）
- [x] 4.2 前端：`npx vitest run` 相关测试 + `npm run build`（vue-tsc）通过
- [x] 4.3 Playwright 实测：多选任务 → 批量删除 → 列表刷新、DB 行消失、日志目录清理
- [x] 4.4 同步 main specs：`node-task-center`（删除 scenario）、`task-log-file-storage`（删除清理强化）、新增 `node-task-deletion` spec
