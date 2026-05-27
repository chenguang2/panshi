## 1. Migration Module

- [x] 1.1 Create `backend/app/core/migrate.py` with `_detect_bad_constraint()` to check for single-column UNIQUE on wrong columns
- [x] 1.2 Implement `_fix_sqlite_table()` — generic SQLite table recreation with compound UNIQUE
- [x] 1.3 Implement `_fix_postgresql_table()` — ALTER TABLE DROP/ADD CONSTRAINT for PostgreSQL
- [x] 1.4 Implement `run_migrations()` entry point covering all 5 tables

## 2. Integration

- [x] 2.1 Call `run_migrations()` in `init_db()` after `Base.metadata.create_all`
- [x] 2.2 Verify migration is idempotent (skip if constraints already correct)

## 3. Database Fix

- [x] 3.1 Fix `ps_upstream` — replace `UNIQUE(edge_uuid)` with `UNIQUE(cluster_id, edge_uuid)`
- [x] 3.2 Fix `ps_route` — replace `UNIQUE(edge_uuid)` with `UNIQUE(cluster_id, edge_uuid)`
- [x] 3.3 Fix `ps_plugin_config` — replace `edge_uuid TEXT UNIQUE` with `UNIQUE(cluster_id, edge_uuid)`
- [x] 3.4 Fix `ps_global_rule` — replace `edge_uuid TEXT UNIQUE` with `UNIQUE(cluster_id, edge_uuid)`
- [x] 3.5 Fix `ps_plugin_metadata` — replace `plugin_name UNIQUE` with `UNIQUE(cluster_id, plugin_name)`
- [x] 3.6 Apply fixes to both `panshi.db` and `sample.db`
