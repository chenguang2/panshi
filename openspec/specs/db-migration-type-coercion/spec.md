# Db Migration Type Coercion

## Purpose

SQLite → PostgreSQL 直连迁移的跨方言类型协同：按目标库列 schema 逐列转换布尔与日期时间值，避免裸字符串/整数直接入列。

## Requirements

### Requirement: Boolean type coercion during direct migration
The system SHALL convert SQLite integer booleans (0/1) to Python bool (True/False) when inserting into PostgreSQL target tables.

#### Scenario: SQLite boolean to PostgreSQL boolean
- **WHEN** migrating a row with `enabled=1` from SQLite to PostgreSQL
- **THEN** the value SHALL be inserted as `True` (Python bool) in the PostgreSQL target

### Requirement: DateTime string to datetime object conversion
The system SHALL convert SQLite DateTime column values from string format to Python datetime objects when inserting into PostgreSQL target tables.

#### Scenario: SQLite datetime string to PostgreSQL timestamp
- **WHEN** migrating a row with `created_at="2026-09-08 12:00:00"` from SQLite to PostgreSQL
- **THEN** the value SHALL be inserted as `datetime(2026, 9, 8, 12, 0, 0)` in the PostgreSQL target

### Requirement: Type coercion applied per-column based on destination schema
The system SHALL detect column types from the destination table schema and apply coercion only to matching columns, preserving raw values for non-matching types.

#### Scenario: Mixed type columns
- **WHEN** migrating a table with Boolean, DateTime, and Text columns
- **THEN** Boolean columns SHALL be coerced to bool, DateTime columns SHALL be coerced to datetime, and Text columns SHALL pass through unchanged
