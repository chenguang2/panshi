# Proposal: 2026-10-02-db-migration-permissions-split

## Why

数据库迁移（SQLite↔PG 迁移/导出/导入）与备份容灾（备份与恢复）此前共用 `database_management` 权限与 `database_management` 功能总闸：只想开放备份管理的运维被迫同时开放高危的数据迁移入口；备份 API 挂在 database_mgmt 组合路由下，`database_management` 功能关闭会把备份容灾一并 404。职责分离需要独立权限域与独立功能开关。

## What Changes

- **权限域拆分**（2e5332cb）：后端新增 `db_migration`/`db_backup` 双权限键（KNOWN_FEATURES + features.yaml 双键）；`db_backup` 路由拆出独立注册键 `feature_routers["db_backup"]`（不再与 database_mgmt 同门，总闸互不牵连）；数据迁移域端点（running-tasks / migrate-stream / export / import / history）改挂 `db_migration` 权限 + 端点级功能闸（`_require_migration_feature`，对齐 system.py 审计闸模式：先权限后 404，不泄露模块存在性）；连接注册表/状态/切换仍随 `database_management`
- **前端同步**（2e5332cb）：featureRouteMap 三路拆分（database_management / db_migration / db_backup 独立路由键）、侧边栏与用户管理权限组同步出现两个新权限选项；运行态 db_config.json 随动
- **摘要卡门控**（dcbb773f）：数据库管理页备份摘要卡渲染挂 `db_backup` 权限（无权限整卡不渲染，避免接口 403 噪音）——此语义此前已在 sqlite-remote-backup spec「备份管理页面与导航」成文，本变更不重复声明
- **功能开关维度补全**（3603e825）：摘要卡门控补功能开关维度（`db_backup` 功能关闭时同样不渲染/不请求）

## Capabilities

### Modified

- `database-management`：「权限控制」改为迁移域独立权限 `db_migration` + 功能闸语义

### Added

- `deployment-feature-config`：新增「Configuration items — db_migration, db_backup」需求

## Impact

- 后端：`backend/app/api/v1/__init__.py`（feature_routers 双键）、`backend/app/api/v1/database.py`（迁移域端点改挂 db_migration + `_require_migration_feature`）、`backend/app/core/features.py`（KNOWN_FEATURES 双键）、`backend/features.yaml`
- 前端：`frontend/src/api/featureRouteMap`（三路拆分）、侧边栏、用户管理权限组、`DatabaseManagement.vue` 摘要卡门控
- 测试：安全守卫与功能开关用例（权限采样、404 闸、摘要卡门控）
- 与既有 spec 的关系：`db_backup` 权限键/摘要卡权限门控已在 `sqlite-remote-backup`（权限与鉴权 / 备份管理页面与导航）成文，本变更补齐 `db_migration` 侧与功能开关维度
