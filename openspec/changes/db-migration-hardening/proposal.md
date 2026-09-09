## Why

数据库管理中的数据迁移功能（SQLite ↔ PostgreSQL）存在三个高风险隐患：直连迁移缺少类型转换可能导致数据类型不匹配或迁移失败；大表一次性全量加载到内存可能导致 OOM 崩溃；迁移前无自动备份机制导致误操作后数据不可恢复。此外，迁移结果返回信息过于简单，用户无法了解迁移详情。

## What Changes

- 直连迁移增加类型转换逻辑：Boolean（int → bool）、DateTime（str → datetime）等类型在插入目标库前自动转换
- 大表分批流式读取：将一次性全量加载改为按批次迭代器读取，控制内存占用
- 迁移前自动备份：在清空目标库前自动导出 ZIP 归档到 `backend/data/backups/` 目录
- 迁移结果返回详细信息：包括迁移表数量、表名列表、每表字段数和行数

## Capabilities

### New Capabilities

- `db-migration-type-coercion`: 直连迁移时自动检测并转换 SQLite/PostgreSQL 之间的类型差异（Boolean、DateTime、JSON 字符串等）
- `db-migration-streaming`: 大表分批流式读取，按 500 行批次迭代，避免一次性加载全表到内存
- `db-migration-auto-backup`: 迁移前自动导出 ZIP 归档到 `backend/data/backups/` 目录，包含迁移前快照
- `db-migration-detail-result`: 迁移结果返回每张表的详细信息（表名、字段数、迁移行数）

### Modified Capabilities

- `database-management`: 迁移 API 返回结构变更，从简单 `{message, tables_migrated}` 升级为包含详细表信息的结构

## Impact

- `backend/app/services/db_migration_service.py`: `_copy_table`、`_row_values`、`_insert_chunk` 函数修改
- `backend/app/services/db_archive_service.py`: `export_archive` 函数需支持 PostgreSQL 源的 DDL 导出
- `backend/app/api/v1/database.py`: `migrate_database` 返回结构变更
- `backend/tests/test_sqlite_to_pg_migration.py`: 需补充类型转换和备份功能测试
- API 返回结构变更可能影响前端显示（需同步更新前端）
