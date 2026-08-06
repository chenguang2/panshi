## Why

节点任务（Node Task Center）出现数据异常：任务显示 3 台节点，但任务中心列表实际出现 6 条记录（`install_task_node` 中同 `task_id` 存在同 `node_id` 的多条 item）。根因是同一任务被重复创建/写入时，`install_task_node` 缺乏同任务同节点的唯一性约束，重复 items 累积且 `total_nodes` 只反映最后一次创建的节点数，导致统计与展示错乱。

## What Changes

- **B1 数据层唯一约束**：`install_task_node` 增加复合唯一索引 `UNIQUE(task_id, node_id)`——同一任务同一节点物理上只允许一条 item，任何重复插入（重复创建、重试路径、手工 SQL）触发 `IntegrityError` 被数据库拒绝
- **B2 同参数防重复创建**：`NodeTaskService.create_task` 在新建任务前检查是否存在相同 `(cluster_id, task_type, node_ids)` 的 pending/running 任务，存在则拒绝新建（防止用户连点/重放导致重复任务）
- **迁移**：`migrate.py` 增加唯一索引迁移（SQLite 重建表 / PostgreSQL 创建唯一索引），迁移前清理存量脏数据（清空 `install_task` 与 `install_task_node` 两张表，不保留历史）

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `node-task-center`: 任务持久化模型增加同任务同节点的唯一性约束，创建任务幂等保护，杜绝重复 items。

## Impact

- `backend/app/models/node_task.py`：`NodeTaskItem` 增加 `UniqueConstraint`
- `backend/app/services/node_task_service.py`：`create_task` 幂等保护
- `backend/app/core/migrate.py`：唯一索引迁移
- `backend/tests/test_node_task_*.py`：新增约束与幂等测试
- 数据：需先清理存量重复 items 才能建唯一索引
