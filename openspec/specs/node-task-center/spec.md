# node-task-center Specification

## Purpose

将节点管理中所有走 ansible/SSH 的运维操作（安装 OpenResty/Edge、关联新 OpenResty、升级 Edge 小版本、启动/停止/reload/状态查询、edge.env 部署等）统一建模为可持久化的异步任务：任务与逐节点子任务落库、状态机驱动执行、可查询/取消/重试、可追溯历史，并提供全局任务中心页面。

## Requirements

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

#### Scenario: 字段迁移自愈（ps_node.openresty_path）
- **WHEN** 数据库存在遗留 `ps_node.edge_install_path` 列（含数据）且 `openresty_path` 列已存在
- **THEN** 启动迁移 SHALL 将 `edge_install_path` 数据回填到 `openresty_path`（仅回填新列为空的行，不覆盖已有数据）
- **AND** 迁移后 SHALL 删除 `edge_install_path` 列
- **AND** 迁移 SHALL 幂等（重复启动无副作用）

### Requirement: 任务执行引擎

系统 SHALL 提供后台任务执行引擎，驱动任务状态机：主任务 `pending → running → success | failed | cancelled | partial`，节点子任务 `pending → running → success | failed | cancelled | skipped`。执行 SHALL 受全局 ansible 并发信号量（`max_playbooks`）约束（**共享现有 `AnsibleRunnerService` 实例的信号量，不新建实例**，V1），并保证同一节点同一时刻只执行一个任务子项。

#### Scenario: 任务串行驱动节点执行
- **WHEN** 任务开始执行
- **THEN** 主任务状态 SHALL 置为 running
- **AND** 引擎 SHALL 按并发限制逐个驱动节点子任务执行（每个子任务获取一次全局信号量，与同步操作共享同一信号量）
- **AND** 子任务完成后 SHALL 持久化其 rc/stdout/stderr/command

#### Scenario: 部分失败标记 partial
- **WHEN** 多节点任务中部分节点成功、部分节点失败
- **THEN** 主任务状态 SHALL 置为 partial
- **AND** 各节点子任务 SHALL 各自保持 success/failed 状态

#### Scenario: 同一节点互斥执行
- **WHEN** 同一节点同时存在两个运行中的任务子项
- **THEN** 引擎 SHALL 保证第二个子项等待第一个完成（per-node 互斥锁），不得并发操作同一节点

#### Scenario: 进程重启后任务状态处理
- **WHEN** 后端进程在任务 running 期间重启
- **THEN** 重启后遗留的 pending/running 任务 SHALL 标记为 failed（带"进程重启中断"标记）
- **AND** 用户 SHALL 可对该任务执行重试

### Requirement: 任务化 API

系统 SHALL 提供任务 CRUD API：创建、集群内列表、全局列表、详情、取消、重试、删除、SSE 实时推送；并提供日志文件读取端点。

#### Scenario: 创建任务
- **WHEN** 用户 POST `/clusters/{cluster_id}/node-tasks`（body 含 task_type、node_ids、params）
- **THEN** 系统 SHALL 返回 201 与任务 id
- **AND** 任务 SHALL 立即以 pending 状态进入执行队列
- **AND** params 缺省字段 SHALL 按任务类型取节点记录值：运维类任务（start/stop/reload/check/statistic）的 prefix 缺省取 `node.edge_path`（edge 程序前缀），安装类任务（install_openresty/install_edge/associate_new_openresty/edge_pack_add）的 prefix 缺省取 `node.openresty_path`（openresty 安装路径）

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
- **AND** edge_pack_add 的 `destpath` SHALL 取 `prefix`（缺省 `node.openresty_path`）的父目录并以 `/` 结尾，与统一管理端点 `edge-pack-add` 一致（不基于 `edge_path`）

#### Scenario: 运维类操作任务化
- **WHEN** 用户创建 task_type 为 `start` / `stop` / `reload` / `check` / `statistic` 的任务
- **THEN** 每个节点子任务 SHALL 调用 `nginx_cmd_run`（start/stop/reload/check）或 `edge_statistic`（statistic），参数（prefix/ports）逐节点取自节点记录
- **AND** prefix 缺省 SHALL 取 `node.edge_path`（edge 程序前缀），与单节点端点一致；用户显式传入 prefix 时 SHALL 以用户参数为准
- **AND** 多节点任务由后端引擎并发驱动（替代前端 runWithConcurrency 编排）

#### Scenario: 环境类操作任务化
- **WHEN** 用户创建 task_type 为 `edge_env_deploy` 的任务
- **THEN** 每个节点子任务 SHALL 调用 `edge_init_env` 部署 edge.env（params 含 env_content）
- **AND** 部署成功后 SHALL 创建 ConfigVersion 记录（与现状一致）

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

## 附录：任务类型与现有执行映射

| task_type | ansible tag / 执行方式 | 关键参数 | 现有端点 |
|---|---|---|---|
| install_openresty | `install_openresty_copy` + SSH `install-edge.sh` | openresty_file, prefix | install-openresty |
| install_edge | `install_edge` | prefix, edge_target | install-edge |
| associate_new_openresty | `upgrade_openresty` | prefix, edge_target | associate-new-openresty |
| edge_pack_add | `edge_pack_add` | srcpath, destpath, pack_file, prefix | edge-pack-add |
| edge_pack_rebase | `edge_pack_rebase` | edge_target, version | edge-pack-rebase |
| start / stop / reload / check | `nginx_cmd_run` | nginx_cmd, prefix, ports | .../start 等 |
| statistic | `edge_statistic` | prefix, ports | .../statistic |
| edge_env_deploy | `edge_init_env` | env_content, destpath | edge-env/deploy |
