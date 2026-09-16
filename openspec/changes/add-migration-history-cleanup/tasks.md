## 1. 后端（TDD：先红后绿）

- [x] 1.1 `tests/test_database_api.py` 新增 `TestMigrationHistoryCleanup`：未鉴权 401、`keep_last<1` 拒绝、保留最近 N 条正确、`running` 记录保留、单条删除 200/404/409、审计落库、预览精确计数（先写测试并确认失败）
- [x] 1.2 `tests/test_db_migration_service.py` 新增 `TestMigrationLogCleanup`（service 层判据）
- [x] 1.3 `db_migration_service`：`_cleanup_scope`（预览与清理共用判据）+ `count_migration_logs` + `preview_cleanup` + `cleanup_migration_logs` + `delete_migration_log`
- [x] 1.4 `GET /database/history/cleanup-preview?keep_last=N`（只读预览：总数 / 将删除 / 将保留）
- [x] 1.5 `POST /database/history/cleanup`（body `{keep_last: int 1..100000}`，权限 `database_management`）
- [x] 1.6 `DELETE /database/history/{log_id}`（不存在 → 404；`running` → 409）
- [x] 1.7 `audit_hook.ROUTE_MAP` 补两条 mutating 映射（`db_migration_log` delete / cleanup）
- [x] 1.8 `tests/test_security_guard.py` 的 UNAUTHENTICATED_SAMPLES 补三条采样（预览 GET / 清理 POST / 单条 DELETE）
- [x] 1.9 后端测试转绿 + `validate_route_map` 确认新路由有映射

## 2. 前端

- [x] 2.1 `api/database.ts` 新增 `cleanupMigrationHistory(keepLast)` 与 `getMigrationHistoryCleanupPreview(keepLast)`；`types/database.ts` 新增 `MigrationHistoryCleanupPreview`
- [x] 2.2 `DatabaseManagement.vue` 历史区标题栏加「清理历史」按钮（`btn btn-secondary btn-sm`，右对齐）
- [x] 2.3 清理弹窗：保留条数输入（默认 10，min 1，max 取服务端总数）、实时预览「库内共 T 条，将删除 N 条，保留 M 条」、活动库作用域说明、危险色确认按钮（`will_delete === 0` 时禁用并提示"无需清理"）
- [x] 2.4 确认后刷新历史；错误走 `errDetail` 透出后端 detail（含迁移期间 503 写锁提示）
- [x] 2.5 历史条数达后端单页上限时提示「仅显示最近 100 条」
- [x] 2.6 `config/auditResourceRoutes.ts` 补 `db_migration_log` 资源标签与 `cleanup` 动作标签（含配置测试）

## 3. 验证

- [x] 3.1 `uv run pytest tests/test_database_api.py tests/test_db_migration_service.py tests/test_security_guard.py` → 131 passed
- [x] 3.2 `npx vue-tsc -b` / `npx eslint` / `npx prettier --check` 全通过；`npx vitest run` 852 个用例通过（1 个 `GlobalRuleList` 用例在满负载并行下超时，单独运行通过，属既有抖动）
- [x] 3.3 活跃库实测（只读 + 0 删除路径）：`cleanup-preview?keep_last=10` → `{total:96, will_delete:86, will_keep:10}`；`POST cleanup {keep_last:100}` → `{deleted:0, remaining:96}`，`ps_db_migration_log` 仍为 96 行
- [x] 3.4 审计落库实测：`sys_audit_log` 新增 `db_migration_log_cleanup`，detail「清理迁移历史：删除 0 条，保留最近 100 条（剩余 96 条）」
- [x] 3.5 Playwright：弹窗预览「库内共 96 条，将删除 86 条，保留 10 条」、保留 96 时确认禁用且提示"无需清理"、保留 95 时提交载荷为 `{"keep_last":95}`（拦截未落库）、无 console 错误
- [x] 3.6 截图核对弹窗视觉与既有连接编辑弹窗一致
