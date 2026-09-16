# Db Migration Detail Result

## Purpose

数据库迁移完成后按表返回明细结果（表名、列数、行数），让管理员可核对迁移覆盖范围。

## Requirements

### Requirement: Detailed migration result per table
The system SHALL return a list of migrated tables with details including table name, column count, row count, and the table's kind.

#### Scenario: Migration result with table details
- **WHEN** migration completes successfully
- **THEN** the API response SHALL include a `tables` array where each entry contains `name` (string), `columns` (integer), `rows` (integer), and `kind` (`business` | `audit_log` | `task_log`)

#### Scenario: Empty migration result
- **WHEN** migration completes but no tables had data
- **THEN** the API response SHALL include an empty `tables` array and `tables_migrated: 0`

### Requirement: Column count reflects source table
The system SHALL report the number of columns from the source table definition, not the destination.

#### Scenario: Source has more columns than destination
- **WHEN** source table has 10 columns but destination only has 8 (legacy schema)
- **THEN** the reported `columns` count SHALL be 10 (source)

### Requirement: 表类型标记（kind）
The system SHALL classify each migrated table as `business` / `audit_log` / `task_log` using the canonical sets in `app/core/db_migration.py`（`AUDIT_LOG_TABLES` = `sys_audit_log`/`ps_import_log`；`TASK_LOG_TABLES` = `install_task`/`install_task_node`；其余为 `business`），供迁移结果页分组呈现。

#### Scenario: 包含日志数据的迁移
- **WHEN** 迁移以「包含日志数据」勾选状态执行
- **THEN** 每条明细的 `kind` SHALL 为 `audit_log` / `task_log` / `business` 之一，取值与表集合判定一致（如 `sys_audit_log` → `audit_log`、`install_task` → `task_log`、`sys_user` → `business`）

#### Scenario: 未包含日志数据的迁移
- **WHEN** 迁移以「包含日志数据」未勾选状态执行
- **THEN** 日志表 SHALL 不出现在 `tables` 中（迁移范围本身已排除），且前端 SHALL 给出"本次迁移未包含日志表"的提示，避免用户误以为日志数据已迁移

#### Scenario: 前端分组呈现
- **WHEN** 迁移结果页展示明细
- **THEN** 前端 SHALL 按 `kind` 分组渲染（业务表 / 审计与导入日志 / 任务日志），并显示各组数量；某组为空时不渲染该组标题
