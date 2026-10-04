# Proposal: db-restore-schema-reconcile — 恢复后 schema 差异自动补齐与重启建议

## Why

跨版本恢复（旧版备份包 → 新版后端）走的是**热激活**路径：`execute_restore` 落位旧 schema 库 → 切 active 指针 → `_engine_reload()` 只重建引擎与会话工厂，**不跑任何迁移**（`create_all` + `run_migrations` 仅在启动期 `init_db` 执行）。恢复成功到下次重启之间存在窗口期：任何触碰新表/新列的查询以 `no such column` 报 500。

同时恢复流程不检测密钥变更：包内 `.jwt_secret` 与进程在用密钥不同时，JWT/Fernet 模块常量要到重启才切换，但恢复结果对此只字不提（用户实测升级路径发现的两个问题之一）。

## What Changes

1. **落位后 schema 补齐（后端）**：`execute_restore` 在引擎重载后自动执行与启动期 `init_db` 相同的迁移路径（`create_all` + `run_migrations`），跨版本恢复即时闭环，不再依赖用户记得重启。
2. **补齐与密钥状态入载荷（后端）**：恢复结果新增 `schema_reconciled` / `tables_added` / `columns_added` / `key_changed` / `restart_recommended` / `schema_migration_error` 字段。
3. **完成指引条件化（前端）**：恢复向导完成面板在既有「重启命令 + 暂存有效期」指引上，按载荷显示 schema 补齐计数与高亮重启建议行。

## Impact

- `backend/app/services/db_restore_service.py`（execute_restore 主体）
- `backend/app/api/v1/db_backup.py`（/restore/execute 响应直通新字段）
- `frontend/src/components/DbBackupRestoreWizard.vue` + 测试
- 主 spec：sqlite-backup-restore（落位与激活 / 恢复完成指引闭环）
