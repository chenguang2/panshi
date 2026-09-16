## Why

「历史迁移记录」区当前只能查看：`GET /database/history` 固定返回最新 100 条（`order_by(id desc).limit(100)`），既无分页也无清理入口。每次迁移/导出/导入（含失败、超时、断连）都会写入一行 `ps_db_migration_log`，因此记录只增不减；超过 100 条后旧记录在界面上永久不可见，却永远留在库里，形成"看不见也删不掉"的组合。实测当前活动库已有 96 条记录，绝大多数是重复的测试迁移，噪声已影响可读性。

## What Changes

- **新增后端 API** `POST /database/history/cleanup`：按「保留最近 N 条」清理当前活动库的迁移历史，返回删除/剩余条数
- **新增后端 API** `GET /database/history/cleanup-preview`：只读预览「总数 / 将删除 / 将保留」（列表接口只返回最近 100 条，条数上限内推不出真实总数，故由服务端按与清理完全相同的判据计算）
- **新增后端 API** `DELETE /database/history/{log_id}`：单条删除（本轮只提供 API，前端暂不暴露入口）
- **新增服务层** `cleanup_migration_logs` / `delete_migration_log`（`db_migration_service`），`status='running'` 的记录永不删除
- 在数据库管理页「历史迁移记录」区新增「清理历史」按钮与清理弹窗：可选保留条数、实时预览「将删除 N 条 / 保留 M 条」、危险色二次确认
- 审计钩子 `ROUTE_MAP` 补两条映射，前端审计标签配置补 `db_migration_log` 资源与 `cleanup` 动作

## Capabilities

### New Capabilities

（无：清理能力归属既有 `database-management` 能力）

### Modified Capabilities

- `database-management`: 「迁移历史记录」能力从"只记录 + 只查看"扩展为"可清理"，并明确清理的保留策略、`running` 保护、审计留痕与活动库作用域

## Impact

- 后端：`backend/app/services/db_migration_service.py` 新增两个函数；`backend/app/api/v1/database.py` 新增两个端点；`backend/app/core/audit_hook.py` 的 `ROUTE_MAP` 补映射
- 前端：`frontend/src/api/database.ts` 新增 `cleanupMigrationHistory`；`frontend/src/views/DatabaseManagement.vue` 历史区新增按钮 + 弹窗；`frontend/src/config/auditResourceRoutes.ts` 补标签
- 数据：仅作用于当前活动库的 `ps_db_migration_log`（该表为操作元数据，按既有 spec 不参与数据迁移，切库后目标库历史从零开始）
- 依赖：无新增依赖；不新增数据表
- **非目标**：不做 CSV 归档后再删除（迁移事件的审计已在 `sys_audit_log` 留痕，二次留档属重复）；不改动 `ps_db_migration_log` 表结构；不引入自动保留策略（写入侧不静默删除）
