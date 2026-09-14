## 1. 后端 — Maintenance 模块改造

- [x] 1.1 将 `backend/app/core/maintenance.py` 中的 `threading.Event` 替换为 `MigrationState` dataclass（in_progress/source_id/target_id/started_at）
- [x] 1.2 改造 `set_migration_in_progress(on, source_id=None, target_id=None)` 函数，on=True 时记录元数据，on=False 时清零
- [x] 1.3 新增 `get_migration_state()` 函数，返回当前 MigrationState 对象
- [x] 1.4 保留 `migration_in_progress()` 向后兼容（读 `.in_progress`）

## 2. 后端 — API 端点

- [x] 2.1 在 `backend/app/api/v1/database.py` 新增 `GET /database/running-tasks` 端点，聚合返回 MigrationState + JOIN Cluster 的 NodeTask 列表（status IN running/pending）
- [x] 2.2 端点使用 `require_db_admin('database_management')` 权限守卫
- [x] 2.3 修改 `POST /database/migrate` 端点，迁移开始时调用 `set_migration_in_progress(True, source_id, target_id)` 传入元数据

## 3. 前端 — API 层 + 类型

- [x] 3.1 在 `frontend/src/types/database.ts` 新增 `MigrationState`、`RunningTask`、`RunningTasksResponse` 类型
- [x] 3.2 在 `frontend/src/api/database.ts` 新增 `getRunningTasks()` 函数

## 4. 前端 — 页面集成

- [x] 4.1 在 `DatabaseManagement.vue` 的"当前数据库"卡片和"连接列表"卡片之间插入"当前任务"卡片
- [x] 4.2 卡片中有任务时显示列表（任务类型中文、集群名称、进度、开始时间），无任务时显示 info 空状态
- [x] 4.3 迁移锁激活时显示 a-alert warning 提示 + 源→目标连接信息
- [x] 4.4 卡片右上角提供手动刷新按钮
- [x] 4.5 `onMounted` 时自动拉取任务列表

## 5. 验证

- [x] 5.1 后端单元测试：验证空任务返回、迁移锁返回（含详情）、节点任务返回（含 cluster_name）、未授权访问
- [x] 5.2 前端页面手动验证：空状态、有任务状态、迁移锁提示（含源→目标）、集群已删除、刷新功能
