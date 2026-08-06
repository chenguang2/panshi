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

#### Scenario: 同任务同节点唯一性约束
- **WHEN** 系统尝试在同一任务下为同一节点插入第二条子任务记录
- **THEN** 数据库 SHALL 拒绝该插入（`install_task_node` 对 `(task_id, node_id)` 有唯一约束，触发完整性错误）
- **AND** 同一任务的子任务表中 SHALL NOT 出现同 node_id 的多条记录

#### Scenario: 同参数防重复创建
- **WHEN** 用户创建节点任务，且存在相同 `(cluster_id, task_type, node_ids, params)` 的 pending/running 任务
- **THEN** 系统 SHALL 拒绝新建并提示「相同参数的节点任务已存在，请勿重复创建」
- **AND** 已终态（success/failed/cancelled）的相同参数任务 SHALL NOT 阻止重新创建

#### Scenario: 任务节点集合调整须先删后插
- **WHEN** 未来实现任务节点集合调整（增删节点）
- **THEN** 调整 SHALL 采用「先删除旧 item 再插入新 item」的方式（同 node_id 二次插入会被唯一约束拒绝，禁止追加式修改）

#### Scenario: 多服务多节点不受影响
- **WHEN** 同一台服务器（同一 IP）上运行多个服务（多个 node_id，各自独立端口/edge_path）
- **THEN** 每个服务 SHALL 以独立 node_id 参与任务，`(task_id, node_id)` 组合各不相同
- **AND** 唯一约束 SHALL NOT 阻止多服务同时加入同一任务
