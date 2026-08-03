# node-task-center Delta Spec

Delta for `openspec/specs/node-task-center/spec.md` — 任务化 API 新增删除场景；取消与并发保护增加"删除前须取消"约束。

## MODIFIED Requirements

### Requirement: 任务化 API

系统 SHALL 提供任务 CRUD API：创建、集群内列表、全局列表、详情、取消、重试、删除、SSE 实时推送；并提供日志文件读取端点。

#### Scenario: 创建任务
- **WHEN** 用户 POST `/clusters/{cluster_id}/node-tasks`（body 含 task_type、node_ids、params）
- **THEN** 系统 SHALL 返回 201 与任务 id
- **AND** 任务 SHALL 立即以 pending 状态进入执行队列
- **AND** params 缺省字段 SHALL 按任务类型取节点记录值（如 install_openresty 的 prefix 缺省取 node.edge_install_path）

#### Scenario: 查询任务列表
- **WHEN** 用户 GET `/node-tasks`（全局）或 GET `/clusters/{cluster_id}/node-tasks`（集群内）
- **THEN** 系统 SHALL 返回任务列表（分页、可按状态/类型/时间筛选）

#### Scenario: 查询任务详情
- **WHEN** 用户 GET `/node-tasks/{task_id}`
- **THEN** 系统 SHALL 返回主任务信息及全部节点子任务（状态/日志摘要/stdout_tail/stderr/耗时/log_file/log_line_count）

#### Scenario: 取消任务
- **WHEN** 用户 POST `/node-tasks/{task_id}/cancel`
- **THEN** 系统 SHALL 终止所有未完成节点子任务（进行中的取消执行，未开始的标 skipped，已完成的保留结果）
- **AND** 主任务状态 SHALL 更新为 cancelled（若全部未完成）或 partial（若部分已完成）
- **AND** 取消操作 SHALL 幂等（重复调用不报错）

#### Scenario: 重试任务
- **WHEN** 用户 POST `/node-tasks/{task_id}/retry`（可选 body 限定 node_ids）
- **THEN** 系统 SHALL 将失败/取消的节点子任务重置为 pending 并重新执行
- **AND** 主任务状态 SHALL 重新置为 running
- **AND** 已成功的节点 SHALL NOT 被重复执行（除非明确指定）
- **AND** 重试子项的日志文件 SHALL 重置（新日志行不丢失）

#### Scenario: 删除单个任务
- **WHEN** 用户 DELETE `/node-tasks/{task_id}`，且任务状态为终态（success/failed/partial/cancelled）
- **THEN** 系统 SHALL 删除该任务及其全部子任务记录（FK CASCADE）
- **AND** 系统 SHALL 清理 `task-logs/{task_id}/` 日志文件目录
- **AND** 返回 `{"deleted": [task_id]}`
- **WHEN** 任务不存在
- **THEN** 系统 SHALL 返回 404
- **WHEN** 任务状态为 running/pending
- **THEN** 系统 SHALL 返回 409，detail 提示"任务执行中，请先取消"

#### Scenario: 批量删除任务
- **WHEN** 用户 POST `/node-tasks/batch-delete`，body 含 `task_ids`
- **THEN** 系统 SHALL 删除所有终态任务（含子任务记录与日志文件）
- **AND** 返回 `{"deleted": [ids], "skipped": [ids]}`，skipped 为执行中或不存在任务

#### Scenario: SSE 实时推送
- **WHEN** 前端连接 GET `/node-tasks/{task_id}/stream`
- **THEN** 系统 SHALL 先推送当前快照（任务状态 + 各节点状态/rc + 已写日志尾部）
- **AND** 随后持续推送增量事件：
  - `log_line`：新产生的日志行（task_id/node_id/line）
  - `node_update`：节点状态变化（node_id/status/rc）
  - `task_update`：任务状态与统计变化（status/success_nodes/failed_nodes 等）
  - `done`：任务结束
- **AND** 任务已是终态（success/failed/partial/cancelled）时快照后 SHALL 立即推送 `done` 并关闭
- **AND** 前端断开后 EventSource 重连 SHALL 从当前状态继续（服务端重发快照）
- **AND** 前端 SHALL 以轮询详情 API 作为断线兜底（每 2 秒轮询直至重连成功或任务结束）

#### Scenario: 读取完整日志
- **WHEN** 用户 GET `/node-tasks/{task_id}/items/{node_id}/log`（可选 `tail=N` 仅取末尾 N 行）
- **THEN** 系统 SHALL 返回该子项日志文件内容（text/plain）
- **AND** 若日志文件不存在 SHALL 回退返回 DB 中的 stdout 摘要

### Requirement: 取消与并发保护

任务执行 SHALL 具备统一的取消通道与 per-node 并发保护，补齐现状仅 install-openresty 可取消的缺口。

#### Scenario: 所有任务类型可取消
- **WHEN** 任一任务类型处于 running
- **THEN** 用户 SHALL 可取消该任务
- **AND** ansible 阶段 SHALL 通过 `run_playbook` 的 `cancel_event` 参数（包装为 `ansible_runner` 的 `cancel_callback`，对进程组发 SIGKILL）终止（V2）
- **AND** SSH 编译阶段 SHALL 通过 kill 子进程终止（非仅 install-openresty）

#### Scenario: 执行中任务删除前须取消
- **WHEN** 用户尝试删除状态为 running/pending 的任务
- **THEN** 系统 SHALL 拒绝删除（409），提示先取消任务
- **AND** 用户取消成功后 SHALL 可再执行删除

#### Scenario: 同一节点任务互斥
- **WHEN** 同一节点已有运行中的任务子项
- **AND** 用户再创建涉及该节点的任务
- **THEN** 新任务的该节点子项 SHALL 等待锁释放后再执行（或创建时提示冲突，待定）
