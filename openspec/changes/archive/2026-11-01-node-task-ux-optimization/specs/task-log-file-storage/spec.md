# node-task-ux-optimization — task-log-file-storage Delta

## ADDED Requirements

### Requirement: 日志导出归档

系统 SHALL 支持将单个任务的执行日志与逐节点结果打包导出，供离线排障与交接留证。

#### Scenario: 整任务日志归档
- **WHEN** 用户请求 `GET /node-tasks/{task_id}/logs/archive`
- **THEN** 系统 SHALL 返回 `application/zip`，按节点 IP 分目录打包该任务的日志文件（含 `attempt{N}` 历史尝试日志）
- **AND** 日志文件缺失的节点 SHALL 写入 `_missing.txt` 说明，不得中断打包
- **AND** 端点 SHALL 挂 `task_center` 权限，未认证 401、无权限 403
- **AND** 打包期间文件消失 SHALL 跳过该文件，不得返回 500

#### Scenario: 历史尝试日志可回看
- **WHEN** 用户请求 `GET /node-tasks/{task_id}/items/{node_id}/log?attempt=N`
- **THEN** 系统 SHALL 返回第 N 次尝试的留档日志（重试前整份改名为 `{node_id}.attempt{N}.log`）
- **AND** 该留档不存在时 SHALL 返回 404

#### Scenario: 单节点日志可下载
- **WHEN** 用户请求 `GET /node-tasks/{task_id}/items/{node_id}/log`
- **THEN** 响应 SHALL 携带 `Content-Disposition: attachment` 与建议文件名，使浏览器可直接下载

## MODIFIED Requirements

### Requirement: 日志文件存储

系统 SHALL 将节点任务子项的完整日志追加写入文件系统，而非写入数据库。每个任务子项对应一个日志文件，路径 SHALL 为 `task-logs/{task_id}/{node_id}.log`（相对后端数据目录）。单个节点日志文件 SHALL 有行数上限（默认 5000 行，可配置），达到上限后 SHALL 写入一行截断标记并停止追加，避免长跑任务日志无限增长。

#### Scenario: 执行期间日志写入文件
- **WHEN** 任务子项开始执行且产生日志行（ansible 输出 / SSH 编译输出）
- **THEN** 系统 SHALL 将该行追加写入该子项的日志文件
- **AND** 日志文件 SHALL 以追加模式打开，不得整体重写
- **AND** 日志写入 SHALL 对 SQLite 无任何写入（不更新 DB 的 logs 字段）

#### Scenario: 日志文件可读
- **WHEN** 用户查询某任务子项的完整日志
- **THEN** 系统 SHALL 能从日志文件读取并返回日志内容（支持全量或末尾 N 行）
- **AND** 若日志文件不存在（如历史任务或无流式日志的命令），系统 SHALL 回退显示数据库中的 stdout 摘要

#### Scenario: 日志行数上限
- **WHEN** 单个节点日志文件达到行数上限（默认 5000 行）
- **THEN** 系统 SHALL 追加一行截断标记（说明已省略行数）并停止继续写入
- **AND** `log_line_count` SHALL 反映实际写入行数
- **AND** 上限值 SHALL 可经配置调整，MUST NOT 硬编码在调用侧

#### Scenario: 重试保留历史日志
- **WHEN** 用户对失败节点发起重试
- **THEN** 该节点日志文件 SHALL NOT 被删除
- **AND** 系统 SHALL 追加「第 N 次执行 · 时间」分隔头后再写入本次日志
