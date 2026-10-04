# db-schema-migration Delta

## ADDED Requirements

### Requirement: Schema self-check never drops existing data

The startup schema self-check SHALL be additive only: it MAY create missing tables (IF NOT EXISTS) and add missing columns, but it SHALL NOT drop or recreate existing tables, schemas, or constraints. Destructive operations (`drop_all`, `DROP TABLE`, `DROP SCHEMA`) MUST NOT exist on any self-check code path, so a self-check against a database that already contains data can never destroy it.

#### Scenario: Self-check against a populated database is a no-op

- **WHEN** the backend starts against a PostgreSQL schema that already contains data and matches the models
- **THEN** the self-check SHALL add nothing and leave all existing tables and rows intact
- **AND** no `DROP` statement SHALL be executed on the self-check path

#### Scenario: Missing structure is created additively

- **WHEN** the self-check detects a missing table or missing column
- **THEN** it SHALL create only the missing structure (IF NOT EXISTS / additive column)
- **AND** existing data in untouched tables SHALL remain intact
