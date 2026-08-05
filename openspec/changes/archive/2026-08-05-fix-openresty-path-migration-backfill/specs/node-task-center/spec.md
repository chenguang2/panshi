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

#### Scenario: 字段迁移自愈（ps_node.openresty_path）
- **WHEN** 数据库存在遗留 `ps_node.edge_install_path` 列（含数据）且 `openresty_path` 列已存在
- **THEN** 启动迁移 SHALL 将 `edge_install_path` 数据回填到 `openresty_path`（仅回填新列为空的行，不覆盖已有数据）
- **AND** 迁移后 SHALL 删除 `edge_install_path` 列
- **AND** 迁移 SHALL 幂等（重复启动无副作用）
