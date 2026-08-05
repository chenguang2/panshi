## Why

`edge_install_path` → `openresty_path` 重命名迁移存在顺序缺陷：若数据库在迁移顺序修复**之前**的版本上运行过（`COLUMN_MIGRATIONS` 先添加了空的 `openresty_path` 列，导致 rename 因"新列已存在"被跳过），数据库会处于**两列共存**状态——数据留在 `edge_install_path`，`openresty_path` 全为空。新代码读取 `openresty_path` 会拿到 NULL，功能失效。

## What Changes

- `migrate.py` 新增 `_merge_legacy_column`：当新旧两列共存时，将 `edge_install_path` 数据回填到 `openresty_path`（仅回填新列为空的行，不覆盖已有数据），然后删除旧列
- `run_migrations` 顺序：`_merge_legacy_column` → `_rename_column` → `COLUMN_MIGRATIONS`，三种库状态全覆盖（两列共存 / 仅旧列 / 全新库）
- 新增 `tests/test_migrate.py`：单列 rename、幂等、两列共存回填三个场景

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `node-task-center`: 无 spec 行为变更（迁移内部修复，API 契约不变）

## Impact

- `backend/app/core/migrate.py`：`_merge_legacy_column` 函数 + `run_migrations` 调用顺序
- `backend/tests/test_migrate.py`：新增迁移测试
- 对真实 panshi.db 验证：8 行数据全部回填成功，旧列删除，幂等
