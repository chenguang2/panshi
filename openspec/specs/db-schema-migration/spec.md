# DB Schema Migration

## Purpose

在应用启动时自动检测并修复数据库 schema 与 SQLAlchemy 模型之间的不一致（如错误的 UNIQUE 约束），避免因模型变更但数据库未同步导致的运行时错误。

## Requirements

### Requirement: Detect constraint inconsistencies
The system SHALL detect when a database table has a single-column UNIQUE constraint where the SQLAlchemy model defines a compound UNIQUE constraint involving `cluster_id`.

#### Scenario: Mismatched constraint detected
- **WHEN** the database has `UNIQUE(edge_uuid)` on `ps_upstream` but the model defines `UNIQUE(cluster_id, edge_uuid)`
- **THEN** the migration system SHALL log a warning and run the fix

#### Scenario: All constraints are correct
- **WHEN** all database constraints match the model definitions
- **THEN** the migration system SHALL log info and skip all tables

### Requirement: Fix single-column UNIQUE on SQLite
The system SHALL replace a single-column UNIQUE constraint with the correct compound `UNIQUE(cluster_id, ...)` on SQLite by recreating the table.

#### Scenario: SQLite table recreated with compound constraint
- **WHEN** a table `ps_plugin_config` has `edge_uuid TEXT UNIQUE NOT NULL` but needs `UNIQUE(cluster_id, edge_uuid)`
- **THEN** the system SHALL create a new table with the compound constraint, copy all data, drop the old table, and rename the new table

### Requirement: Fix single-column UNIQUE on PostgreSQL
The system SHALL replace a single-column UNIQUE constraint with the correct compound constraint on PostgreSQL using ALTER TABLE.

#### Scenario: PostgreSQL constraint replaced
- **WHEN** a table has a single-column UNIQUE constraint that should be compound
- **THEN** the system SHALL execute `ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT ...`

### Requirement: Migration is idempotent
The migration SHALL only run when a mismatch is detected. Running multiple times SHALL be a no-op after the first successful fix.

#### Scenario: Repeated startup
- **WHEN** the application starts after constraints have already been fixed
- **THEN** the migration system SHALL not alter any tables

### Requirement: Covered tables
The migration SHALL cover all tables where the model defines a compound UNIQUE constraint:

| Table | Wrong constraint | Correct constraint |
|---|---|---|
| ps_upstream | UNIQUE(edge_uuid) | UNIQUE(cluster_id, edge_uuid) |
| ps_route | UNIQUE(edge_uuid) | UNIQUE(cluster_id, edge_uuid) |
| ps_plugin_config | UNIQUE(edge_uuid) | UNIQUE(cluster_id, edge_uuid) |
| ps_global_rule | UNIQUE(edge_uuid) | UNIQUE(cluster_id, edge_uuid) |
| ps_plugin_metadata | UNIQUE(plugin_name) | UNIQUE(cluster_id, plugin_name) |

#### Scenario: All five tables fixed
- **WHEN** the migration runs on a database with all five wrong constraints
- **THEN** each table SHALL be fixed to use the correct compound UNIQUE constraint
