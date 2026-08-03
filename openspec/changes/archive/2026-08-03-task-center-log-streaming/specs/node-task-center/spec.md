# node-task-center Delta Spec

Delta for `openspec/specs/node-task-center/spec.md` — 日志持久化与 SSE 实时推送要求升级为"日志落文件 + DB 存摘要 + 真实 SSE 事件推送"。

## MODIFIED Requirements

### Requirement: 任务持久化模型

系统 SHALL 提供任务持久化模型，记录节点操作任务的完整生命周期信息。主任务表 SHALL 存储任务类型、状态、参数快照、节点数统计、创建时间、开始/结束时间；节点子任务表 SHALL 存储逐节点状态、返回码、日志摘要、stdout/stderr 摘要、命令、开始/结束时间。

#### Scenario: 创建任务时落库
- **WHEN** 用户创建一个节点操作任务
- **THEN** 系统 SHALL 在主任务表中插入一条记录（status=pending、task_type、params 参数快照、total_nodes）
- **AND** 为每个目标节点在节点子任务表中插入一条记录（status=pending，含 ip/node_name 快照）
- **AND** 立即返回任务 id

#### Scenario: 节点被删除后任务历史仍可读
- **WHEN** 任务创建后其目标节点被删除
- **AND** 用户查询该任务详情
- **THEN** 系统 SHALL 仍能展示该节点的子任务记录（因 ip/node_name 已冗余快照）
- **AND** 节点子任务的 `node_id` 列 SHALL 不是外键（普通 int 列），节点删除 SHALL NOT 级联删除任务子项（V4）

#### Scenario: 任务状态变化落库
- **WHEN** 任务或其子任务状态发生变化（running/success/failed/cancelled/skipped/partial）
- **THEN** 系统 SHALL 持久化更新对应记录
- **AND** 完整日志 SHALL 追加写入该子项的日志文件（`task-logs/{task_id}/{node_id}.log`），不写入数据库 logs 字段
- **AND** 子任务执行期间 DB SHALL 仅更新状态与统计摘要（rc/起止时间），不得写入大对象日志

#### Scenario: 日志摘要落库
- **WHEN** 子任务执行完成或执行中状态更新
- **THEN** 系统 SHALL 在 `install_task_node` 持久化 `log_file`（相对路径）、`log_line_count`（行数）、`stdout_tail`（末尾最多 8KB 摘要）
- **AND** `stdout` 字段 SHALL 存储摘要尾部内容以保持 API 兼容

### Requirement: 任务化 API

系统 SHALL 提供任务 CRUD API：创建、集群内列表、全局列表、详情、取消、重试、SSE 实时推送；并提供日志文件读取端点。

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
- **AND** 重试子项的日志文件 SHALL 追加到原文件或重建（新日志行不丢失）

#### Scenario: SSE 实时推送
- **WHEN** 前端连接 GET `/node-tasks/{task_id}/stream`
- **THEN** 系统 SHALL 先推送当前快照（任务状态 + 各节点状态/rc + 已写日志尾部）
- **AND** 随后持续推送增量事件：
  - `log_line`：新产生的日志行（task_id/node_id/line）
  - `node_update`：节点状态变化（node_id/status/rc）
  - `task_update`：任务状态与统计变化（status/success_nodes/failed_nodes 等）
  - `done`：任务结束
- **AND** 前端断开后 EventSource 重连 SHALL 从当前状态继续（服务端重发快照）
- **AND** 前端 SHALL 以轮询详情 API 作为断线兜底（每 2 秒轮询直至重连成功或任务结束）

#### Scenario: 读取完整日志
- **WHEN** 用户 GET `/node-tasks/{task_id}/items/{node_id}/log`（可选 `tail=N` 仅取末尾 N 行）
- **THEN** 系统 SHALL 返回该子项日志文件内容（text/plain）
- **AND** 若日志文件不存在 SHALL 返回 404 或回退返回 DB 中的 stdout 摘要
