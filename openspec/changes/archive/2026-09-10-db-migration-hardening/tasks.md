## 1. 类型转换（db-migration-type-coercion）

- [x] 1.1 在 `db_migration_service.py` 中添加 `_coerce_value(value, col_type)` 函数，处理 Boolean（int → bool）、DateTime（str → datetime）转换
- [x] 1.2 修改 `_row_values` 函数，接收目标表列类型信息，对每列调用 `_coerce_value` 进行类型转换
- [x] 1.3 修改 `_copy_table` 函数，传递目标表列类型到 `_row_values`
- [x] 1.4 编写单元测试：验证 SQLite boolean 0/1 → PostgreSQL True/False 转换
- [x] 1.5 编写单元测试：验证 SQLite datetime string → PostgreSQL datetime object 转换

## 2. 流式读取（db-migration-streaming）

- [x] 2.1 修改 `_copy_table` 函数，将 `mappings().all()` 改为迭代器 + 批量收集模式
- [x] 2.2 实现批次处理逻辑：每收集 BATCH_SIZE（500）行调用一次 `_insert_chunk`
- [x] 2.3 处理最后一批不足 BATCH_SIZE 的情况
- [x] 2.4 编写单元测试：验证大表（1000+行）分批读取不 OOM
- [x] 2.5 编写单元测试：验证空表迁移不报错

## 3. 自动备份（db-migration-auto-backup）

- [x] 3.1 在 `database.py` 的 `migrate_database` 函数中，`confirmed_clear=True` 时自动调用 `export_archive` 导出备份
- [x] 3.2 实现备份目录自动创建：`backend/data/backups/`
- [x] 3.3 实现备份文件命名：`migration_{source_id}_to_{target_id}_{timestamp}.zip`
- [x] 3.4 实现备份保留策略：保留最近 10 个备份，删除更旧的
- [x] 3.5 修改 API 返回结构，增加 `backup_path` 字段
- [x] 3.6 编写单元测试：验证备份文件创建和保留策略

## 4. 详细迁移结果（db-migration-detail-result）

- [x] 4.1 修改 `migrate_direct` 返回值，从 `int` 改为 `list[dict]`，每项包含 `name`、`columns`、`rows`
- [x] 4.2 修改 `_copy_table` 函数，返回每张表的列数和行数统计
- [x] 4.3 修改 `database.py` 的 `migrate_database` 函数，构建详细返回结构
- [x] 4.4 修改 API 返回结构：`{message, tables_migrated, tables: [{name, columns, rows}], backup_path}`
- [x] 4.5 编写单元测试：验证返回结构包含每张表的详细信息

## 5. 集成测试和清理

- [x] 5.1 更新 `test_sqlite_to_pg_migration.py`，验证类型转换在实际迁移中生效
- [x] 5.2 更新 `test_database_api.py`，验证新的 API 返回结构
- [x] 5.3 端到端测试：SQLite → PostgreSQL 完整迁移验证
- [x] 5.4 端到端测试：PostgreSQL → SQLite 完整迁移验证
- [x] 5.5 更新前端 `database.ts` 类型定义，适配新返回结构
