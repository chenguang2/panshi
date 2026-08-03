# task-log-file-storage Delta Spec

Delta for `openspec/specs/task-log-file-storage/spec.md` — 文件生命周期 requirement 强化：删除清理需覆盖批量删除与幂等性。

## MODIFIED Requirements

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

#### Scenario: 日志文件不存在时读取回退
- **WHEN** 用户查询某任务子项的完整日志且日志文件不存在
- **THEN** 系统 SHALL 回退返回 DB 中的 stdout 摘要（历史任务/无流式日志任务）
