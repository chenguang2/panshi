# Design: 2026-10-02-db-migration-permissions-split

## Context

迁移（高危、低频）与备份容灾（日常运维）共用一个权限键与一个功能总闸，无法差异化授权；备份路由挂在 database_mgmt 组合 router 下导致总闸误伤。

## Decisions

- **D1 双键注册**：`KNOWN_FEATURES` 与 features.yaml 同步加 `db_migration`/`db_backup`；`feature_routers["db_backup"]` 独立注册键，main.py 条件注册互不牵连。
- **D2 端点级功能闸对齐审计闸模式**：`_require_migration_feature()` 在 handler 体首句调用——FastAPI 依赖注入先解析权限依赖，无权限者先得 403，404「数据迁移模块未启用」不泄露模块存在性；请求期实时读 features.yaml（mtime 热加载），关闸即时生效。
- **D3 闸覆盖面收敛**：仅数据迁移域端点（running-tasks/migrate-stream/export/import/history）经功能闸；连接注册表/状态/切换随 `database_management` 注册级门控，不经此检查——迁移功能关闭不影响换库运维。
- **D4 摘要卡双维门控**：`db_backup` 权限（用户维度）与功能开关（部署维度）任一不满足都不渲染、不发起请求。
