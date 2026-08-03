# task-log-file-storage Specification

## Purpose

节点任务中心的完整执行日志（ansible 输出、SSH 编译输出等）不再写入 SQLite 数据库，而是追加写入任务日志文件；数据库只保存摘要信息（末尾日志片段、行数、文件路径）。大体积日志（实测单节点 install_openresty 编译输出约 3.7MB）通过文件系统持久化，避免 SQLite 单写者锁与写放大问题。

## Requirements

### Requirement: 日志文件存储

系统 SHALL 将节点任务子项的完整日志追加写入文件系统，而非写入数据库。每个任务子项对应一个日志文件，路径 SHALL 为 `task-logs/{task_id}/{node_id}.log`（相对后端数据目录）。

#### Scenario: 执行期间日志写入文件
- **WHEN** 任务子项开始执行且产生日志行（ansible 输出 / SSH 编译输出）
- **THEN** 系统 SHALL 将该行追加写入该子项的日志文件
- **AND** 日志文件 SHALL 以追加模式打开，不得整体重写
- **AND** 日志写入 SHALL 对 SQLite 无任何写入（不更新 DB 的 logs 字段）

#### Scenario: 日志文件可读
- **WHEN** 用户查询某任务子项的完整日志
- **THEN** 系统 SHALL 能从日志文件读取并返回日志内容（支持全量或末尾 N 行）
- **AND** 若日志文件不存在（如历史任务或无流式日志的命令），系统 SHALL 回退显示数据库中的 stdout 摘要

### Requirement: 数据库摘要字段

`install_task_node` 表 SHALL 新增摘要列以支持日志预览与断点续传，同时保留 rc/状态/起止时间等结构化字段。

#### Scenario: 摘要列持久化
- **WHEN** 任务子项执行完成
- **THEN** 系统 SHALL 持久化以下字段到 `install_task_node`：
  - `log_file`：日志文件相对路径（仅当有日志行写入时）
  - `log_line_count`：已写入日志行数
  - `stdout_tail`：日志末尾片段（默认最多 8KB）
- **AND** `stdout` 字段 SHALL 存储摘要尾部内容（与 `stdout_tail` 一致），保持既有 API 字段兼容
- **AND** `logs` 字段 SHALL 不再追加执行日志（保持为空）

#### Scenario: 迁移幂等
- **WHEN** 系统启动执行 schema 迁移
- **THEN** 新增列操作 SHALL 幂等（列已存在则跳过）
- **AND** 旧历史任务行（`log_file` 为 NULL）SHALL 仍可正常展示（回退使用 `stdout` 全量）

### Requirement: 文件安全与生命周期

日志文件路径 SHALL 由整数任务/节点 ID 构造，防止路径穿越；文件写入 SHALL 通过追加模式并发安全；任务删除 SHALL 同步清理日志文件。

#### Scenario: 路径安全
- **WHEN** 系统构造日志文件路径
- **THEN** 路径 SHALL 仅由 `task-logs/` 前缀 + 整数 task_id + 整数 node_id 组成
- **AND** 目录 SHALL 自动创建（`mkdir(parents=True, exist_ok=True)`）

#### Scenario: 任务删除清理
- **WHEN** 节点任务被删除（单个删除或批量删除，含级联删除子项）
- **THEN** 系统 SHALL 同步清理对应日志文件与目录
- **AND** 清理 SHALL 幂等（日志文件/目录不存在时 SHALL NOT 报错）
