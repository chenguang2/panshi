# Tasks: 2026-10-02-db-migration-permissions-split

> 追溯性建档：代码已合入（2e5332cb、dcbb773f、3603e825），以下为实际执行记录。

## 1. 后端权限域与功能开关拆分（2e5332cb）

- [x] 1.1 KNOWN_FEATURES + features.yaml 加 `db_migration`/`db_backup` 双键
- [x] 1.2 `api/v1/__init__.py`：`db_backup` 拆出独立 feature_routers 注册键
- [x] 1.3 `database.py`：迁移域五端点改挂 `require_permission('db_migration')` + `_require_migration_feature()` 404 闸
- [x] 1.4 安全守卫采样与权限测试更新（无 db_migration 权限 403、功能关闸 404）

## 2. 前端同步（2e5332cb）

- [x] 2.1 featureRouteMap 三路拆分（database_management / db_migration / db_backup）
- [x] 2.2 侧边栏与用户管理权限组出现两个新权限选项；运行态 db_config.json 随动

## 3. 摘要卡门控（dcbb773f、3603e825）

- [x] 3.1 DatabaseManagement.vue 摘要卡挂 `db_backup` 权限门控（无权限整卡不渲染）
- [x] 3.2 补功能开关维度（db_backup 功能关闭同样不渲染/不请求）
- [x] 3.3 回归：权限/功能开关/摘要卡用例全绿
