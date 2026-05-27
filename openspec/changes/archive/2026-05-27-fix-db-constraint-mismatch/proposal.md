## Why

数据库 `ps_upstream`、`ps_route`、`ps_plugin_config`、`ps_global_rule`、`ps_plugin_metadata` 五张表实际建有单列 `UNIQUE`（如 `UNIQUE(edge_uuid)`、`UNIQUE(plugin_name)`），但 SQLAlchemy 模型定义的是复合 `UNIQUE(cluster_id, edge_uuid)` / `UNIQUE(cluster_id, plugin_name)`。跨集群 Edge 数据导入时，不同集群的同名插件或相同 edge_uuid 记录会触发 `UNIQUE constraint failed` 错误。

## What Changes

- 新增 `backend/app/core/migrate.py` 迁移模块，启动时自动检测并修复错误的 UNIQUE 约束
- 修改 `backend/app/core/database.py` 的 `init_db()`，在 `create_all` 之后调用迁移
- 支持 SQLite（重建表）和 PostgreSQL（ALTER TABLE）两种数据库
- 迁移幂等：已修复的表跳过，不影响下次启动性能
- 直接修复开发数据库 `panshi.db` 和 `sample.db`

## Capabilities

### New Capabilities

- `db-schema-migration`: 启动时自动对齐数据库 schema 与 SQLAlchemy 模型，修复约束、索引等不一致

### Modified Capabilities

_无 spec 级别行为变更_

## Impact

- `backend/app/core/migrate.py` — 新文件，迁移代码
- `backend/app/core/database.py` — 新增 `run_migrations()` 调用
- `backend/data/panshi.db` — 已直接修复
- `backend/data/sample.db` — 已直接修复
- 启动耗时增加约 10ms（仅首次检查约束）
