## Context

节点任务中心出现数据异常：任务 `total_nodes=3` 但 `install_task_node` 中同 `task_id` 有 6 条记录（同 node_id 多条 item）。根因：`install_task_node` 无 `(task_id, node_id)` 唯一约束，重复创建/写入路径导致 items 累积，`total_nodes` 只反映最后一次创建的节点数。

## Goals / Non-Goals

**Goals:**
- 数据层杜绝同任务同节点的重复 item（唯一约束）
- 代码层防重复创建（create_task 幂等）
- 多服务多节点场景（同 IP 多 node_id）不受影响

**Non-Goals:**
- 不改变 retry 语义（retry 是 reset 状态，不新增 item）
- 不清理历史存量脏数据（由运维执行，迁移前需清理）
- 不做 B3（执行时去重兜底）——用户选择 B1+B2

## Decisions

### Decision 1: 唯一约束（B1）

`NodeTaskItem` 增加复合唯一索引：

```python
__table_args__ = (
    UniqueConstraint("task_id", "node_id", name="uq_install_task_node_task_node"),
)
```

**理由**：数据层硬约束，任何路径（重复创建、重试、手工 SQL）都触发完整性错误。
**多服务确认（讨论确认）**：同一 IP 多服务 = 多个 node_id，`(task_id, node_id)` 组合各不相同，约束不误伤。同 node_id 多端口（未来）仍是单 item 内 ports 多值，不冲突。

**迁移**：`migrate.py` 新增唯一索引迁移。SQLite 需重建表（参照 `_fix_sqlite_table` 模式，用 `CREATE UNIQUE INDEX` 替代）；PostgreSQL 用 `CREATE UNIQUE INDEX`。迁移前清理存量脏数据。

**清理策略（讨论确认）**：直接清空 `install_task` 与 `install_task_node` 两张表（不保留历史）。理由：脏数据分属多批（不同 node_name 快照/时间），无保留价值，且任务中心为运维辅助功能，历史任务记录影响小。

### Decision 2: 同参数防重复创建（B2）

```python
async def create_task(self, db, cluster_id, task_type, node_ids, params=None, ...):
    # 防重复：检查是否存在相同参数（cluster/task_type/node_ids 一致）的进行中任务
    existing = await db.execute(
        select(NodeTask.id).where(
            NodeTask.cluster_id == cluster_id,
            NodeTask.task_type == task_type,
            NodeTask.status.in_(["pending", "running"]),
        )
    )
    for task_id in existing.scalars():
        task = await db.get(NodeTask, task_id)
        if task and task.get_params() == (params or {}):
            if set(task.node_ids) == set(node_ids):
                raise ValueError("相同参数的节点任务已存在，请勿重复创建")
    # 原有新建逻辑
```

**理由（讨论确认）**：`create_task` 每次新建 task（新 id），检查"新 task 有无 items"无效。真正的重复场景是**同参数（cluster/task_type/node_ids）的进行中任务重复创建**（用户连点/重放）。pending/running 状态才拦截（终态任务可重新创建）。

**注意**：`NodeTask` 需提供 `node_ids` 访问器（当前仅存 params 快照，node_ids 从 items 反查）。实现时从 items 反查或补充快照。

### Decision 3: 存量数据清理

建唯一索引前清空 `install_task` 与 `install_task_node` 两张表（讨论确认：不保留历史）。作为迁移前置步骤（运维执行或迁移函数内检测到重复 items 时触发）。

## Risks / Trade-offs

- [存量脏数据导致建索引失败] → 迁移前清空两张表（讨论确认：不保留）
- [SQLite 表重建丢失数据] → 参照现有 `_fix_sqlite_table` 模式（建新表+拷贝+改名），事务保护
- [唯一约束影响未来多端口场景] → 多端口仍是单 item（ports 逗号分隔），不冲突
- [唯一约束影响未来任务节点集合调整] → **讨论确认**：任务节点集合调整（增删节点）须用"先删后插"而非"追加"（同 node_id 二次插入会被唯一约束拒绝），spec 中注明
- [同参数防重复创建误拦截正常任务] → 仅拦截 pending/running 状态；终态任务（success/failed/cancelled）可正常重建

## Migration Plan

1. 清空 `install_task_node` 与 `install_task`（迁移前，运维执行或迁移函数触发）
2. migrate.py 执行唯一索引（SQLite 重建表 / PostgreSQL CREATE UNIQUE INDEX）
3. 重启后端自动迁移

## Open Questions

无。
