## Context

`ps_node` 表的 `edge_install_path` 列实际存储 OpenResty 安装路径，命名易与 `edge_path`（Edge 程序目录）混淆。全栈重命名为 `openresty_path`。

## Goals / Non-Goals

**Goals:**
- 全栈字段重命名 `edge_install_path` → `openresty_path`
- 存量数据库列重命名且数据保留
- 前端 label 与字段语义统一（OpenResty）

**Non-Goals:**
- 不重命名 `edge_path`（保留，方案 B 决定）
- 不改动 API 路由路径、任务类型、ansible 变量名（ansible 侧参数仍叫 prefix，非 edge_install_path）
- 不改归档的历史 change 工件

## Decisions

### Decision 1: 全栈机械重命名

后端 model/schema/API/service/tests、前端 types/composables/views/tests 中 `edge_install_path` 全部替换为 `openresty_path`。

**理由**：字段是前后端共享契约，必须同步改名，否则 API 序列化不匹配。

### Decision 2: 数据库迁移用 RENAME COLUMN 保留数据

新增 `_rename_column(engine, table, old, new)`，在 `run_migrations` 中于 `COLUMN_MIGRATIONS` 之前执行：

```python
if _rename_column(engine, "ps_node", "edge_install_path", "openresty_path"):
    migrated_any = True
```

**顺序关键**：必须**先 rename 再 add**——若先执行 `COLUMN_MIGRATIONS`（含新列 `openresty_path`）会先创建新列，导致 rename 因"新列已存在"被跳过、旧列残留。

SQLite（≥3.25）与 PostgreSQL 均支持 `ALTER TABLE ... RENAME COLUMN`，一条语句通用。`COLUMN_MIGRATIONS` 中对应条目更新为新列名（处理从未有过该列的库）。

**备选方案**：新增列 + 拷贝数据 + 删旧列 —— 拒绝，RENAME COLUMN 更简洁且数据天然保留。

### Decision 3: 前端 label 统一

"Nginx安装路径" → "OpenResty安装路径"（表单 label、表格列标题、详情展示），与 `openresty_path` 语义一致；"（同Edge安装路径）"占位文案保留。

## Risks / Trade-offs

- [存量库迁移失败（如 SQLite 版本过旧）] → `_rename_column` 失败仅告警不中断，且新库/旧库都能通过 add 路径兜底
- [API 字段破坏性变更] → 前后端同仓库同步修改，无外部消费者；spec 标记 BREAKING
- [遗漏引用] → 全量 grep 校验残留 + pytest/vitest/build 三重验证

## Migration Plan

后端启动时 `run_migrations` 自动执行列重命名（数据保留）。无需人工干预。

## Open Questions

无。
