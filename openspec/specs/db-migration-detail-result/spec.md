# Db Migration Detail Result

## Purpose

数据库迁移完成后按表返回明细结果（表名、列数、行数），让管理员可核对迁移覆盖范围。

## Requirements

### Requirement: Detailed migration result per table
The system SHALL return a list of migrated tables with details including table name, column count, row count, and whether the table is a log table.

#### Scenario: Migration result with table details
- **WHEN** migration completes successfully
- **THEN** the API response SHALL include a `tables` array where each entry contains `name` (string), `columns` (integer), `rows` (integer), and `is_log` (boolean)

#### Scenario: Empty migration result
- **WHEN** migration completes but no tables had data
- **THEN** the API response SHALL include an empty `tables` array and `tables_migrated: 0`

### Requirement: Column count reflects source table
The system SHALL report the number of columns from the source table definition, not the destination.

#### Scenario: Source has more columns than destination
- **WHEN** source table has 10 columns but destination only has 8 (legacy schema)
- **THEN** the reported `columns` count SHALL be 10 (source)

### Requirement: 日志表标记
The system SHALL mark each migrated table as a log table or not, using the canonical log table set defined in `app/core/db_migration.py`（`sys_audit_log` / `ps_import_log` / `install_task` / `install_task_node`），供迁移结果页把日志表与非日志表分开呈现。

#### Scenario: 包含日志数据的迁移
- **WHEN** 迁移以「包含日志数据」勾选状态执行
- **THEN** 每条明细的 `is_log` SHALL 为 `true` 当且仅当该表属于日志表集合（如 `sys_audit_log` 为 true、`sys_user` 为 false）

#### Scenario: 未包含日志数据的迁移
- **WHEN** 迁移以「包含日志数据」未勾选状态执行
- **THEN** 日志表 SHALL 不出现在 `tables` 中（迁移范围本身已排除），且前端 SHALL 给出"本次迁移未包含日志表"的提示，避免用户误以为日志数据已迁移
