## Context

`Base.metadata.create_all` 仅在表不存在时创建，不会修改已有表。项目启动时调用的 `init_db()` 使用 `create_all`，但开发数据库（`panshi.db`、`sample.db`）由早期版本的模型创建，导致实际 schema 与当前模型不一致。

具体表现为 `ps_upstream`、`ps_route`、`ps_plugin_config`、`ps_global_rule` 四张表建有 `UNIQUE(edge_uuid)`，`ps_plugin_metadata` 建有 `UNIQUE(plugin_name)`，而模型定义的是复合 `UNIQUE(cluster_id, edge_uuid)` / `UNIQUE(cluster_id, plugin_name)`。

## Goals / Non-Goals

**Goals:**
- 启动时自动检测并修复所有表的约束不一致问题
- 迁移幂等，每次启动只做一次检查
- 支持 SQLite 和 PostgreSQL

**Non-Goals:**
- 不引入 Alembic 等迁移框架（当前项目无此依赖）
- 不修改 import、CRUD 等业务代码（业务逻辑已经正确，只是 DB schema 不对）

## Decisions

**方案：自建轻量迁移函数**

| 方案 | 评估 |
|---|---|
| Alembic | 太重，为一次修复引入整个框架不划算 |
| 手动 SQL 脚本 | 需人工执行，容易遗漏 |
| 启动时自动检测修复 | ✅ 零运维成本，幂等，覆盖所有环境 |

**SQLite 迁移方案：重建表**

SQLite 不支持 `ALTER TABLE DROP CONSTRAINT`，因此采用 CREATE → COPY → DROP → RENAME 模式：
1. 关闭外键检查
2. 用正确约束建新表
3. 全量拷贝数据
4. 删除旧表
5. 新表重命名为旧名
6. 恢复外键检查

**PostgreSQL 迁移方案：ALTER TABLE**

```sql
ALTER TABLE ps_upstream DROP CONSTRAINT IF EXISTS "ps_upstream_edge_uuid_key";
ALTER TABLE ps_upstream ADD CONSTRAINT "uq_upstream_edge_uuid" UNIQUE (cluster_id, edge_uuid);
```

**约束检测方式**

使用 `inspect(engine).get_indexes()` 检查数据库实际索引，而不是解析 DDL 字符串。更可靠，且跨数据库兼容。

## Risks / Trade-offs

- [表重建期间数据一致性] → 单条事务内完成，失败自动回滚
- [外键引用] → 重建前关闭 FK 检查，完成后恢复；`ConfigVersion` 使用 `resource_type`+`resource_id` 泛型引用，不涉及物理 FK
- [并发启动] → 迁移在 ASGI 启动事件中同步执行，无并发问题
- [PostgreSQL 约束名猜测] → 使用 `DROP CONSTRAINT IF EXISTS`，不存在时静默跳过
