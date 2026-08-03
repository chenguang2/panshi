# Design: node-task-delete

## Context

节点任务中心（`node-task-center` + `task-log-file-storage` 已实现）具备：持久化任务模型（`install_task` / `install_task_node`）、日志文件存储（`task-logs/{task_id}/{node_id}.log`）、SSE 实时推送、列表轮询。当前任务生命周期缺"删除"：任务创建后只能取消/重试。实测 19 个任务占 8.1MB 日志文件，且只进不出。

约束：直接修改 `node_tasks.py` / `NodeTaskCenter.vue`；DB 已有 `install_task_node.task_id` FK `ON DELETE CASCADE`；`task_log_store.delete_task_logs(task_id)` 已实现（删目录下 *.log 并尝试 rmdir）；复用系统 `showDeleteConfirm` 自定义 modal 模式。

## Goals / Non-Goals

**Goals:**
- 单任务硬删除：删 `install_task` 行 → 级联删 `install_task_node` → 清 `task-logs/{task_id}/`
- 批量删除：多选任务一次删除
- 终态保护：running/pending 任务不可删除（返回 409，提示先取消）
- 前端多选交互 + 系统风格红色确认框
- 删除后列表刷新、轮询/SSE 联动停止

**Non-Goals:**
- 不做软删除/回收站（任务无恢复需求，硬删除直接）
- 不做自动过期清理（如按天数自动删）——本变更只做手动删除，自动清理留待后续
- 不修改 DB schema（复用现有 CASCADE）
- 不做跨集群/跨节点的复杂级联（任务本就自包含）

## Decisions

### D1: 硬删除，复用 FK CASCADE + 显式日志清理

**决定**：删除端点执行两步：
1. `DELETE FROM install_task WHERE id = :id`（SQLite/PostgreSQL 依赖 FK `ON DELETE CASCADE` 自动删 `install_task_node`）
2. `task_log_store.delete_task_logs(task_id)` 清理日志目录（含 rmdir 兜底）

**理由**：任务无回滚/恢复价值，硬删除最简单且符合"运维记录"定位；日志文件不会被 FK 级联（在文件系统而非 DB），必须显式清理，复用既有工具零新增逻辑。

**备选**：软删除（status=deleted）——否决，需要改查询过滤逻辑，且列表长期堆积已删除记录，收益低。

### D2: 两个端点：单删 + 批量删

**决定**：
- `DELETE /node-tasks/{task_id}` — 单删，404 不存在 / 409 非终态
- `POST /node-tasks/batch-delete`，body `{"task_ids": [1,2,3]}` — 批量删；对每个 id 校验，跳过 running/pending（返回部分成功信息），全量失败返回 409

**理由**：批量用 POST（避免 GET/POST body 语义混乱，且非幂等破坏性操作用 POST 符合惯例）；前端多选后一次请求，减少 N 次往返。

**备选**：`DELETE /node-tasks?ids=1,2,3` query 参数——否决，URL 长度受限且语义不清晰。

### D3: 终态保护

**决定**：删除前检查 `task.status`，仅 `success/failed/partial/cancelled` 允许删除；`running/pending` 返回 409，detail 提示"任务执行中，请先取消"。批量删除时跳过非终态并报告 `skipped` 列表。

**理由**：防止误删执行中任务导致日志丢失/状态错乱；与既有"取消 → 重试"流程衔接（先取消再删除）。

### D4: 前端多选 + 系统确认框

**决定**：
- `a-table` 启用 `rowSelection`（checkbox 列），支持多选
- 选中行后工具栏出现"批量删除（N）"按钮（仅当所选全部为终态时可用，或删除时后端兜底）
- 单行操作列加"删除"按钮（`v-if` 终态才显示）
- 删除确认复用 `showDeleteConfirm` 同款自定义 modal（`h`+`render` 动态渲染）：红色标题、描述"将删除 N 个任务的数据库记录及其日志文件，不可恢复"
- 删除成功后 `loadTasks` 刷新 + `selectedRowKeys` 清空；若删除的是当前打开详情/轮询中的任务，同步 `stopStream`

**理由**：与上游删除确认框 100% 统一（系统既定模式）；多选删除覆盖"清理堆积失败任务"的核心场景。

### D5: API 响应

**决定**：
- 单删成功返回 `{"deleted": [task_id]}`（或 204）——选 200 + body 便于前端统一处理
- 批量删返回 `{"deleted": [ids], "skipped": [ids], "detail": "..."}`，skipped 含非终态或不存在 id
- 错误：404 `{"detail": "任务不存在"}`；409 `{"detail": "任务执行中，请先取消"}`

## Risks / Trade-offs

- **[误删风险]** → 终态保护 + 红色确认框双重防线；确认框明确写"不可恢复"；已取消/失败任务误删损失低（日志文件可接受丢失）
- **[日志清理失败]** → `delete_task_logs` 已有 unlink + rmdir 兜底；清理失败不影响 DB 删除（先删 DB 后清文件，失败仅记日志）
- **[批量删除部分失败语义]** → 返回 skipped 列表，前端提示"N 个已删除，M 个跳过（执行中/不存在）"
- **[多实例并发删除]** → 单进程部署；批量删除用单事务，删除期间同 id 重复请求由 FK/行锁保证幂等（第二次 404）
- **[与轮询/SSE 竞争]** → 前端删除成功后才 stopStream + 刷新，删除中的任务流事件自然终止（任务已不存在）

## Migration Plan

1. 纯新增端点 + 前端功能，无 schema 变更，一次部署即可
2. 既有数据不受影响（删除仅对用户主动选择的任务生效）
3. 回滚：前端移除删除按钮/多选即可；后端端点保留无害
