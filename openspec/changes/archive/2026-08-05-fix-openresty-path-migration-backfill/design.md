## Context

重命名迁移的顺序缺陷导致"两列共存"遗留状态：早期版本先执行 `COLUMN_MIGRATIONS`（添加空 `openresty_path`），`_rename_column` 因新列已存在被跳过，数据滞留在 `edge_install_path`。

## Goals / Non-Goals

**Goals:**
- 自愈"两列共存"库：回填数据 + 删除旧列
- 保持纯 rename（仅旧列）与全新库路径不变
- 迁移幂等

**Non-Goals:**
- 不改 API、前端、业务逻辑（纯迁移修复）

## Decisions

### Decision 1: 新增 `_merge_legacy_column` 处理两列共存

```python
def _merge_legacy_column(engine, table, old_name, new_name) -> bool:
    # 两列都存在才处理
    UPDATE {table} SET {new_name} = {old_name}
      WHERE ({new_name} IS NULL OR {new_name} = '') AND {old_name} IS NOT NULL
    ALTER TABLE {table} DROP COLUMN {old_name}
```

**回填条件**：仅新列为空（NULL 或 ''）且旧列有值才回填——不覆盖新列已有数据（如人工填写的值）。

### Decision 2: 迁移顺序三态全覆盖

```python
if _merge_legacy_column(...):   # 两列共存 → 回填+删旧列
    migrated_any = True
if _rename_column(...):         # 仅旧列 → rename
    migrated_any = True
# COLUMN_MIGRATIONS → 全新库 add 新列
```

**理由**：`_merge` 先处理最坏状态，`_rename` 处理纯旧库，`add` 兜底全新库，三者互斥覆盖所有历史形态。

## Risks / Trade-offs

- [DROP COLUMN 在旧版 SQLite（<3.35）不支持] → `_merge` 捕获异常仅告警；实际运行 SQLite 3.50 与 PostgreSQL 均支持
- [新列已有值被覆盖] → 回填条件限制仅空值行，已测（id=3 手工值保留）

## Migration Plan

后端启动自动执行。真实 panshi.db 已验证修复。

## Open Questions

无。
