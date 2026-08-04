# SQLite 外键与孤儿数据清理

## 背景

本项目后端使用 SQLAlchemy 管理数据库，`install_task_node.task_id` 定义了外键 `ON DELETE CASCADE`——删除任务时应自动级联删除其子任务记录。

**但 CASCADE 只在连接启用了外键约束时生效。** SQLite 默认 `PRAGMA foreign_keys=OFF`，若用 `sqlite3` 命令行或 Python `sqlite3` 模块直连操作数据库，删除 `install_task` 行**不会级联删除** `install_task_node`，从而产生**孤儿数据**。

## 问题现象

节点任务列表/详情中出现**多余节点记录**：

- 选了 2 个节点创建任务，详情却显示 3~4 条节点记录（同一 IP 出现多次）
- 列表显示"2/2 成功"却又是"部分成功"（统计字段是多个残留 item 状态叠加的结果）
- 任务 `total_nodes` 与 `item_count` 不一致

### 根本原因

1. **SQLite 主键 id 复用**：删除最大 id 的任务后，新建任务可能复用该 id
2. **外键未生效**：旧任务的子任务记录在删除主任务时未级联删除，成为孤儿
3. **查询合并**：新任务复用旧 id 后，`WHERE task_id = <id>` 同时查到旧残留 item 与新 item，数量翻倍

## 排查方法

### 1. 检查孤儿 item（task 已不存在）

```sql
SELECT n.id, n.task_id, n.node_id
FROM install_task_node n
LEFT JOIN install_task t ON n.task_id = t.id
WHERE t.id IS NULL
ORDER BY n.id;
```

### 2. 检查幽灵 item（id 复用残留，item 早于任务创建）

```sql
SELECT n.id, n.task_id, n.node_id, n.started_at, t.created_at
FROM install_task_node n
JOIN install_task t ON n.task_id = t.id
WHERE n.started_at IS NOT NULL AND n.started_at < t.created_at
ORDER BY n.id;
```

### 3. 检查任务 item 数 vs total_nodes

```sql
SELECT t.id, t.total_nodes, COUNT(n.id) AS item_count
FROM install_task t
LEFT JOIN install_task_node n ON n.task_id = t.id
GROUP BY t.id
ORDER BY t.id;
```

`item_count != total_nodes` 即为异常。

## 清理方法

> **重要**：清理前先确认数据库连接**已开启外键**，否则清理本身又会制造新问题。

### Python 清理脚本（推荐）

```python
import sqlite3

conn = sqlite3.connect('data/panshi.db')
cur = conn.cursor()
cur.execute('PRAGMA foreign_keys=ON')  # 关键：开启外键

# 1. 删除孤儿 item（task 已不存在）
cur.execute('''
    DELETE FROM install_task_node
    WHERE task_id IN (
        SELECT n.task_id
        FROM install_task_node n
        LEFT JOIN install_task t ON n.task_id = t.id
        WHERE t.id IS NULL
    )
''')
print('删除孤儿 item:', cur.rowcount)

# 2. 删除幽灵 item（item 开始时间早于任务创建时间 = id 复用残留）
cur.execute('''
    DELETE FROM install_task_node
    WHERE id IN (
        SELECT n.id
        FROM install_task_node n
        JOIN install_task t ON n.task_id = t.id
        WHERE n.started_at IS NOT NULL AND n.started_at < t.created_at
    )
''')
print('删除幽灵 item:', cur.rowcount)

conn.commit()

# 3. 重新计算任务统计字段（与真实 item 对齐）
cur.execute('''
    UPDATE install_task SET
        success_nodes   = (SELECT COUNT(*) FROM install_task_node n
                           WHERE n.task_id = install_task.id AND n.status = 'success'),
        failed_nodes    = (SELECT COUNT(*) FROM install_task_node n
                           WHERE n.task_id = install_task.id AND n.status = 'failed'),
        cancelled_nodes = (SELECT COUNT(*) FROM install_task_node n
                           WHERE n.task_id = install_task.id AND n.status = 'cancelled')
    WHERE id IN (SELECT DISTINCT task_id FROM install_task_node)
''')
conn.commit()
print('统计已重算')
```

### 清理后验证

```sql
-- 剩余孤儿 item 应为 0
SELECT COUNT(*) FROM install_task_node n
LEFT JOIN install_task t ON n.task_id = t.id
WHERE t.id IS NULL;

-- 剩余幽灵 item 应为 0
SELECT COUNT(*) FROM install_task_node n
JOIN install_task t ON n.task_id = t.id
WHERE n.started_at IS NOT NULL AND n.started_at < t.created_at;
```

## 预防措施

1. **直连 sqlite3 操作前先 `PRAGMA foreign_keys=ON`**——命令行为：
   ```bash
   sqlite3 data/panshi.db "PRAGMA foreign_keys=ON; DELETE FROM install_task WHERE id=1;"
   ```
2. **优先走应用 API 删除**（如节点任务的删除端点），应用已配置 `foreign_keys=ON`，级联正常
3. **不要用未开启外键的连接删除有子表的主表记录**（`install_task`、`ps_cluster` 等都有子表）

## 相关表

| 主表 | 子表 | 外键 |
|---|---|---|
| `install_task` | `install_task_node` | `task_id → install_task.id ON DELETE CASCADE` |

其他存在类似级联关系的表（`ps_*`、`sys_*` 系列）同理：直连删除前务必确认外键开启。
