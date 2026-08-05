## MODIFIED Requirements

### Requirement: 任务化 API

系统 SHALL 提供任务 CRUD API：创建、集群内列表、全局列表、详情、取消、重试、删除、SSE 实时推送；并提供日志文件读取端点。

#### Scenario: 创建任务
- **WHEN** 用户 POST `/clusters/{cluster_id}/node-tasks`（body 含 task_type、node_ids、params）
- **THEN** 系统 SHALL 返回 201 与任务 id
- **AND** 任务 SHALL 立即以 pending 状态进入执行队列
- **AND** params 缺省字段 SHALL 按任务类型取节点记录值：运维类任务（start/stop/reload/check/statistic）的 prefix 缺省取 `node.edge_path`（edge 程序前缀），安装类任务（install_openresty/install_edge/associate_new_openresty/edge_pack_add）的 prefix 缺省取 `node.edge_install_path`（openresty 安装路径）

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

### Requirement: 覆盖的操作类型

任务化 SHALL 覆盖全部 12 类现有 ansible/SSH 节点操作，参数语义与现有单节点端点一致。

#### Scenario: 安装类操作任务化
- **WHEN** 用户创建 task_type 为 `install_openresty` 的任务
- **THEN** 每个节点子任务 SHALL 执行两阶段：ansible `install_openresty_copy`（传包解压）+ 直连 SSH `install-edge.sh`（编译）
- **AND** 取消 SHALL 能终止 SSH 编译子进程（复用/泛化 `_install_proc_registry` 机制）
- **WHEN** 用户创建 task_type 为 `install_edge` / `associate_new_openresty` / `edge_pack_add` / `edge_pack_rebase` 的任务
- **THEN** 子任务 SHALL 分别调用对应 ansible tag（`install_edge` / `upgrade_openresty` / `edge_pack_add` / `edge_pack_rebase`），参数与现有端点一致

#### Scenario: 运维类操作任务化
- **WHEN** 用户创建 task_type 为 `start` / `stop` / `reload` / `check` / `statistic` 的任务
- **THEN** 每个节点子任务 SHALL 调用 `nginx_cmd_run`（start/stop/reload/check）或 `edge_statistic`（statistic），参数（prefix/ports）逐节点取自节点记录
- **AND** prefix 缺省 SHALL 取 `node.edge_path`（edge 程序前缀），与单节点端点一致；用户显式传入 prefix 时 SHALL 以用户参数为准
- **AND** 多节点任务由后端引擎并发驱动（替代前端 runWithConcurrency 编排）

#### Scenario: 环境类操作任务化
- **WHEN** 用户创建 task_type 为 `edge_env_deploy` 的任务
- **THEN** 每个节点子任务 SHALL 调用 `edge_init_env` 部署 edge.env（params 含 env_content）
- **AND** 部署成功后 SHALL 创建 ConfigVersion 记录（与现状一致）
