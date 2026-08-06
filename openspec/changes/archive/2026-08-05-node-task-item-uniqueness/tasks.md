## 1. 唯一约束（B1，TDD）

- [x] 1.1 新增测试：`install_task_node` 对 `(task_id, node_id)` 有唯一约束，重复插入触发 IntegrityError
- [x] 1.2 `app/models/node_task.py` 的 `NodeTaskItem` 增加 `UniqueConstraint("task_id", "node_id")`，运行测试 GREEN

## 2. 迁移

- [x] 2.1 `migrate.py` 新增唯一索引迁移（SQLite 重建表 / PostgreSQL 创建唯一索引）
- [x] 2.2 迁移测试：含重复 items 的库先清空两张表再建索引；无重复的库直接建索引

## 3. 同参数防重复创建（B2，TDD）

- [x] 3.1 新增测试：`create_task` 遇到相同 (cluster_id, task_type, node_ids, params) 的 pending/running 任务时拒绝新建
- [x] 3.2 新增测试：相同参数但任务已终态时不拦截（可重建）
- [x] 3.3 `app/services/node_task_service.py` `create_task` 增加同参数防重复检查，运行测试 GREEN

## 4. 验证

- [x] 4.1 清空 `install_task` / `install_task_node` 存量脏数据，重建唯一索引
- [x] 4.2 后端全量 pytest（无新增失败）
- [x] 4.3 手动验证：重复创建同节点同参数任务被拒绝；多服务多节点任务正常

## 5. 额外修复：删除任务显式清理 items

- [x] 5.1 发现：`_delete_task_row` 依赖 FK CASCADE 删除 items，但 SQLite 部分连接 FK 未启用导致 items 残留（孤儿 item 与新任务 id 复用冲突，触发 UNIQUE 冲突 500）
- [x] 5.2 新增测试 `test_delete_row_explicitly_removes_items_without_fk`（FK 关闭场景下 items 必须被显式删除）——RED
- [x] 5.3 `_delete_task_row` 改为显式 `delete(NodeTaskItem)` 后删 task，不依赖 FK CASCADE——GREEN（7/7 通过）
