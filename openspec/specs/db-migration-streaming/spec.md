# Db Migration Streaming

## Purpose

大表直连迁移的内存受控读取与原子批量写入：源表按批次流式读取，批次原子提交，约束冲突降级为逐行插入并跳过脏行。

## Requirements

### Requirement: Batch streaming read for large tables
The system SHALL read source table data in batches of BATCH_SIZE (500) rows using SQLAlchemy result iterators instead of loading all rows into memory at once.

#### Scenario: Large table migration
- **WHEN** migrating a table with 10,000 rows
- **THEN** the system SHALL read and insert data in batches of 500 rows, keeping memory usage bounded

#### Scenario: Empty table migration
- **WHEN** migrating a table with 0 rows
- **THEN** the system SHALL skip the table without error and continue to the next table

### Requirement: Batch insertion with atomic commit
The system SHALL insert each batch atomically using a single transaction commit, and fall back to row-by-row insertion on IntegrityError.

#### Scenario: Batch insert success
- **WHEN** inserting a batch of 500 rows with no constraint violations
- **THEN** all 500 rows SHALL be committed in a single transaction

#### Scenario: Batch insert integrity error
- **WHEN** inserting a batch that violates a constraint (e.g., duplicate key)
- **THEN** the system SHALL fall back to row-by-row insertion, skipping rows that violate constraints and logging warnings
