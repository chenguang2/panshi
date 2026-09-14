## Why

数据库管理页面在执行数据库迁移时会锁定写操作（503），但用户无法看到当前有哪些任务正在运行。当用户遇到"正在迁移数据库，暂时禁止写操作，请稍后重试"时，缺乏足够的上下文信息来判断等待时长和当前状态。需要在数据库管理页面增加"当前正在执行的任务"列表，让用户一目了然。

## What Changes

- **改造 `maintenance.py`**：将纯 boolean `threading.Event` 升级为 `MigrationState` 数据类，额外存储 `source_id`、`target_id`、`started_at`，使 API 能返回迁移详情
- **新增后端 API** `GET /database/running-tasks`，返回当前正在执行的任务列表（数据库迁移状态+详情 + 正在运行/排队中的节点任务），节点任务含集群名称
- 在数据库管理页面新增"当前任务"卡片，展示正在执行的任务列表
- 页面加载时自动拉取任务列表，提供手动刷新

## Capabilities

### New Capabilities
- `db-running-tasks-api`: 后端 API 端点，聚合返回数据库迁移状态（含详情）和节点任务执行状态
- `db-running-tasks-ui`: 数据库管理页面"当前任务"卡片组件

### Modified Capabilities
- `database-management`: 在数据库管理页面中新增任务列表展示区域

## Impact

- 后端：`backend/app/core/maintenance.py` 改造为 MigrationState，`backend/app/api/v1/database.py` 新增端点 + 迁移端点传入元数据
- 前端：`frontend/src/api/database.ts` 新增 API 调用，`frontend/src/views/DatabaseManagement.vue` 新增任务列表卡片
- 依赖：无新外部依赖，复用已有的 `NodeTask` 模型、`Cluster` 模型和 `maintenance` 模块
