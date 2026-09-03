## Why

当前系统仅在删除用户（`delete_user`）和删除集群（`delete_cluster`）两个接口记录审计日志，其他 50+ 个增删改接口（路由、上游、SSL、插件、节点、DNS 代理、全局规则、静态资源、流代理等）均无审计记录。无法追溯「谁在什么时间修改/删除了什么资源」，存在安全合规风险。需实现全接口审计覆盖，并提供管理员查看界面。

## What Changes

1. **中间件自动记录「骨架」**：拦截所有 `/api/v1/` 请求，根据 HTTP 方法+路由自动推断 `action`/`resource`，记录用户、IP、时间、`resource_id`（从 URL 解析）。
2. **业务接口补全「血肉」**：关键业务接口（创建/更新/删除）显式补全 `detail` 字段（如 `uri`、`name`、变更前后对比），复用同一 `AuditLog` 对象（`request.state.audit`）。
3. **批量操作**：按「1 条汇总」记录，detail 列出受影响资源 ID 列表。
4. **失败请求**：不记审计，仅记错误日志；成功请求（2xx）才落审计。
5. **历史版本表（ConfigVersion）**：不纳入审计，仅发布/回滚记录。
6. **新增审计日志界面**：管理员专用列表页（筛选、详情抽屉、导出 CSV/Excel）。

## Capabilities

### New Capabilities
- `audit-middleware`: 全接口自动审计中间件，解析路由生成基础骨架
- `audit-detail-enhancement`: 业务接口显式补全 detail 字段的规范与工具函数
- `audit-log-ui`: 审计日志查看界面（列表、筛选、详情、导出）

### Modified Capabilities
- `user-management`: 增加审计日志查看权限控制（`permission: system_audit` + `feature: audit_log`）

## Impact

- **Backend 新增**：`app/middleware/audit_middleware.py`、路由映射表、工具函数
- **Backend 修改**：~30 个路由文件的增删改接口（补全 `detail`），`app/services/audit.py`（增强 `log_audit` 支持同一对象补全）
- **Database**：复用现有 `sys_audit_log` 表，无 schema 变更
- **Frontend 新增**：`views/AuditLog.vue`、路由、菜单项、API 模块 `auditLog.ts`
- **Permissions**：新增 `system_audit` 权限键，仅管理员可见