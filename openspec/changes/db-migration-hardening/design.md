## Context

磐石 Gateway 的数据库管理功能支持 SQLite ↔ PostgreSQL 数据迁移。当前实现通过 SQLAlchemy Core 反射机制读取源库表结构和数据，按 FK 依赖顺序逐表复制到目标库。

**现有代码位置**：
- `backend/app/services/db_migration_service.py` — 直连迁移核心逻辑
- `backend/app/services/db_archive_service.py` — 归档导入/导出
- `backend/app/api/v1/database.py` — 迁移 API 路由
- `backend/app/core/db_migration.py` — 表依赖顺序和任务状态机

**已知问题**：
1. `_copy_table` 直接读取源库行并原样插入目标库，未做类型转换
2. `src_conn.execute(src_table.select()).mappings().all()` 一次性加载全表到内存
3. 迁移前无自动备份，`confirmed_clear=True` 清空目标库后不可恢复
4. API 返回 `{message, tables_migrated}` 过于简单

## Goals / Non-Goals

**Goals:**
- 修复 SQLite → PostgreSQL 类型转换问题（Boolean、DateTime）
- 大表分批流式读取，内存占用控制在 O(BATCH_SIZE) 级别
- 迁移前自动备份到 `backend/data/backups/` 目录
- API 返回每张表的详细迁移信息（表名、字段数、行数）
- 保持现有幂等性和 FK 依赖顺序不变

**Non-Goals:**
- 不修改 JSON 字段的存储类型（Text → JSONB），这是后续优化
- 不实现断点续传（复杂度高，当前场景不需要）
- 不修改归档迁移路径（`import_archive` 已有 `_coerce_row` 类型转换）
- 不修改前端显示逻辑（API 返回结构变更后前端自然适配）

## Decisions

### D1: 类型转换策略 — 复用 `_coerce_row` 逻辑

**选择**：在 `_row_values` 中增加类型转换，复用 `db_archive_service.py` 的 `_coerce_row` 逻辑。

**备选方案**：
- A) 让 SQLAlchemy ORM 层自动转换 → 不可行，直连迁移用的是 Core 层 `dst_table.insert()`
- B) 在数据库驱动层配置类型适配器 → 不同数据库驱动 API 不同，维护成本高
- C) 写入前显式转换 → 简单可控，与归档迁移逻辑一致

**实现**：
```python
# 在 _row_values 中增加转换
from sqlalchemy import Boolean as SA_Boolean, DateTime as SA_DateTime

def _coerce_value(value, col_type):
    if value is None:
        return None
    if isinstance(col_type, SA_Boolean):
        return bool(value)
    if isinstance(col_type, SA_DateTime) and isinstance(value, str):
        return datetime.fromisoformat(value)
    return value
```

### D2: 流式读取策略 — 保持现有批处理框架

**选择**：将 `_copy_table` 中的 `mappings().all()` 改为 `yield_per()` 迭代器 + 批量收集。

**备选方案**：
- A) 使用 `stream()` 游标 → SQLAlchemy Core 的 `stream()` 已废弃
- B) 用 `yield_per()` 迭代器 → SQLAlchemy 内置支持，无需额外依赖
- C) 手动实现 OFFSET/LIMIT 分页 → 多次查询，性能差

**实现**：
```python
# 修改 _copy_table
with src_engine.connect() as src_conn:
    result = src_conn.execute(src_table.select())
    batch = []
    for row in result.mappings():
        batch.append(row)
        if len(batch) >= BATCH_SIZE:
            _insert_chunk(dst_engine, dst_table, cols, batch, table, ...)
            batch.clear()
    if batch:  # 处理最后一批
        _insert_chunk(dst_engine, dst_table, cols, batch, table, ...)
```

### D3: 自动备份策略 — 复用现有归档导出

**选择**：迁移前调用 `db_archive_service.export_archive()` 导出 ZIP 到 `backend/data/backups/`。

**备选方案**：
- A) SQLite 文件复制 → 只支持 SQLite 源，PostgreSQL 源无法复制
- B) pg_dump / sqlite3 .dump → 依赖外部工具，增加部署复杂度
- C) 复用现有归档导出 → 已实现、跨库兼容、格式统一

**实现**：
```python
# 在 migrate_database API 中
backup_dir = Path("./data/backups")
backup_dir.mkdir(exist_ok=True)
ts = datetime.now().strftime("%Y%m%d_%H%M%S")
backup_path = backup_dir / f"migration_{source_id}_to_{target_id}_{ts}.zip"
db_archive_service.export_archive(source, str(backup_path))
```

### D4: 详细结果结构 — 返回每张表信息

**选择**：修改 `migrate_direct` 返回值，从 `int` 改为 `list[dict]`，每项包含表名、字段数、迁移行数。

**实现**：
```python
# 返回结构
{
    "message": "迁移完成，共迁移 22 张表",
    "tables_migrated": 22,
    "tables": [
        {"name": "sys_user", "columns": 12, "rows": 150},
        {"name": "ps_cluster", "columns": 8, "rows": 5},
        ...
    ]
}
```

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| 类型转换可能遗漏某些边界类型 | 覆盖 Boolean、DateTime、String 三种主要类型，其他类型保持原样传递 |
| 大表分批读取增加数据库连接时间 | 批次大小保持 500 行，与现有 `_insert_chunk` 一致 |
| 自动备份增加迁移耗时 | 备份是可选的，用户可选择跳过；备份文件自动清理（保留最近 10 个） |
| API 返回结构变更影响前端 | 前端已使用 `tables_migrated` 字段，新增字段向后兼容 |
| PostgreSQL 源的 DDL 导出（`_get_ddl`）不支持 | 当前只影响归档导出，直连迁移不依赖 DDL；后续可扩展 |

## Migration Plan

1. 修改 `db_migration_service.py`：增加类型转换和流式读取
2. 修改 `db_archive_service.py`：`_get_ddl` 支持 PostgreSQL 源
3. 修改 `database.py` API：增加自动备份和详细返回结构
4. 更新测试：补充类型转换和备份功能测试
5. 部署后验证：在测试环境执行 SQLite → PostgreSQL 迁移验证

## Open Questions

1. 备份文件保留策略：保留最近 10 个还是按时间/大小清理？
2. 前端是否需要显示每张表的详细迁移信息？（当前只显示总数）
