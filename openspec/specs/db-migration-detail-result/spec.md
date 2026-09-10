# Db Migration Detail Result

## Purpose

数据库迁移完成后按表返回明细结果（表名、列数、行数），让管理员可核对迁移覆盖范围。

## Requirements

### Requirement: Detailed migration result per table
The system SHALL return a list of migrated tables with details including table name, column count, and row count for each table.

#### Scenario: Migration result with table details
- **WHEN** migration completes successfully
- **THEN** the API response SHALL include a `tables` array where each entry contains `name` (string), `columns` (integer), and `rows` (integer)

#### Scenario: Empty migration result
- **WHEN** migration completes but no tables had data
- **THEN** the API response SHALL include an empty `tables` array and `tables_migrated: 0`

### Requirement: Column count reflects source table
The system SHALL report the number of columns from the source table definition, not the destination.

#### Scenario: Source has more columns than destination
- **WHEN** source table has 10 columns but destination only has 8 (legacy schema)
- **THEN** the reported `columns` count SHALL be 10 (source)
