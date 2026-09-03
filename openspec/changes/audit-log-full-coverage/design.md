## Context

当前系统仅在 `delete_user` 和 `delete_cluster` 两个接口调用 `log_audit()`，其他 50+ 个增删改接口无审计。现有 `sys_audit_log` 表结构完备（user_id、username、action、resource、resource_id、detail、ip_address、created_at），复用即可。

约束：
- 所有 API 统一前缀 `/api/v1/`，JWT 认证，`Depends(get_current_user)` 注入当前用户
- FastAPI 依赖注入链：`router.on_route hook → depends(get_db) → route handler`（hook 在路由匹配后触发，可访问 `path_params`）
- 事务边界：`AsyncSession` 在请求结束时自动 commit/rollback
- 前端 Vue 3 + Ant Design Vue，权限控制基于 `feature` + `permission` 双键

## Goals / Non-Goals

**Goals:**
1. 所有 `/api/v1/` 增删改接口自动产生审计骨架（router.on_route Hook）
2. 关键业务接口显式补全 `detail`（同一 `AuditLog` 对象，UPDATE 需含前后对比）
3. 批量操作 1 条汇总，失败不记审计
4. 新增审计日志查看界面（仅管理员，feature flag 最高优先级）

**Non-Goals:**
- 不修改 `sys_audit_log` 表结构
- 不审计 GET/只读接口
- 不审计 ConfigVersion（历史版本表）
- 不实现审计日志的实时推送/告警

## Decisions

### 1. 拦截机制：router.on_route Hook（而非中间件） → **Q1 选择 B**
| 方案 | 优点 | 缺点 | 决定 |
|------|------|------|------|
| router.on_route Hook | 路由匹配后触发，可直接访问 `request.path_params` 提取 `cluster_id`/`route_id` | 需在 FastAPI app 启动时注册到每个 router | ✅ 选中 (Q1=B) |
| 中间件 | 全站拦截、统一逻辑 | 运行在路由匹配前，无法获取 `path_params`；需手工 regex 解析路径 | ❌ |
| 装饰器 | 业务侧显式、灵活 | 需改动所有路由、易漏加 | ❌ |
| SQLAlchemy 事件 | 完全解耦、连手工脚本都能记 | 难拿业务语义、用户/IP、批量性能 | ❌（仅作兜底） |

**路由映射表设计**：`{method + path_pattern: (resource, action, is_batch)}`，约 30 条，如：
```python
ROUTE_MAP = {
    ("DELETE", "/clusters/{cluster_id}/routes/{route_id}"): ("route", "delete", False),
    ("POST",   "/clusters/{cluster_id}/routes"):       ("route", "create", False),
    ("PUT",    "/clusters/{cluster_id}/routes/{route_id}"): ("route", "update", False),
    ("PATCH",  "/clusters/{cluster_id}/routes/{route_id}"): ("route", "patch", False),
    ("DELETE", "/clusters/{cluster_id}/routes"):       ("route", "batch_delete", True),
    # ...
}
```

Hook 逻辑：
1. 仅拦截 POST/PUT/PATCH/DELETE
2. 跳过 GET/HEAD/OPTIONS、WebSocket upgrade、SSE、健康检查端点
3. 从 `request.path_params` 提取 `resource_id`
4. 创建 `AuditLog` 骨架，`db.add()`，挂 `request.state.audit`

### 2. 同一 `AuditLog` 对象贯穿 Hook→业务代码 → **选择 `request.state.audit` 传递**
- Hook：`request.state.audit = AuditLog(...); db.add(audit)`
- 业务：`request.state.audit.detail = f"删除路由 {route.name} ({route.uri})"`
- 同一事务 commit，仅落 1 条记录

### 3. 创建类接口的 `resource_id` 回填
- Hook 先记 `resource_id = None`
- 业务代码 flush 后拿到新 ID：`request.state.audit.resource_id = new_obj.id`
- 或调用 `log_audit(db, audit_obj=request.state.audit, resource_id=new_obj.id)` 回填

### 4. 批量删除/更新 → 1 条汇总
- 映射表标记 `is_batch=True`，Hook 记 `resource_id=0`
- Handler 读 body 获取 ID 列表，补全 `detail = f"批量删除路由: [14, 15, 16] 共 3 条"`
- 部分成功/失败时：仅记"尝试批量删除 [ids]"，最终成败由事务结果决定（失败则整体回滚）

### 5. 失败请求不记审计
- Hook 添加 `AuditLog` 到 session；异常时 FastAPI 全局异常处理器触发 session rollback，审计随事务自然丢弃
- 无需在 Hook 中显式判断 status_code

### 6. 更新操作记录变更前后对比 → **Q2 选择 A**
- 业务代码需：读旧值 → 应用更新 → flush → 生成对比 detail
- 示例：`"更新路由 xxx: uri 从 '/old' 变更为 '/new'"`
- 并发修改场景：detail 反映读取时状态，若模型有乐观锁版本号可附加 `(version=5)`

### 7. feature flag 最高优先级 → **Q3 选择 B**
- `features.yaml` 中 `audit_log: false` 时，全员不可见（含 admin）
- `audit_log: true` 时，再按 `audit_logs` 权限控制菜单显示

### 8. 前端界面设计
- 菜单：系统管理 → 审计日志（`feature: audit_log`, `permission: audit_logs`）
- 列表：`a-table` + 列（时间、用户、操作、资源、资源ID、详情、IP），详情列截断+tooltip
- 筛选：用户/操作/资源下拉（动态从 `/api/v1/system/operations/meta` 加载）、时间范围（默认最近 7 天）
- 详情：抽屉展开完整 `detail`、支持滚动/复制、资源名可点击跳转（映射表 `auditResourceRoutes.ts` 维护）
- 导出：≤5000 行前端直出；>5000 行后端异步生成文件供下载
- 权限键：`audit_logs`（复数，与现有 `clusters`/`routes` 一致）

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|----------|
| 路由映射表维护成本（新增接口易忘记加映射） | 1) 单元测试校验所有 `/api/v1/` mutating 路由均在映射表中 2) 启动时扫描路由表自动生成映射表骨架 |
| 业务代码忘记补全 `detail` | 1) 代码审查清单强制检查 2) Hook 在 handler 返回后、commit 前若 `detail` 为空则回填通用模板 |
| 批量操作 `resource_id` 无法单一记录 | 映射表标记 `is_batch=True`，Hook 记 `resource_id=0`，detail 列 ID 列表 |
| 并发下 `request.state` 隔离 | FastAPI 每请求独立 `Request` 对象，`request.state` 天然隔离 |
| 事务回滚时 `AuditLog` 残留 | 依赖 `AsyncSession` 自动 rollback，无需额外处理 |
| 更新操作 detail 记录的是读取时状态而非提交时状态 | 接受限制；若模型有乐观锁版本号可在 detail 附加 `(version=5)` 供参考 |
| 大数据量导出性能 | 分阈值处理：≤5000 行前端直出，>5000 行后端异步生成临时文件供下载 |
| filter 下拉选项动态加载依赖新增 meta 接口 | 复用现有 `/api/v1/system/operations` 扩展 `meta` 子路径，改动最小 |

## Migration Plan

1. **Phase 1**：新增 Hook 注册、路由映射表、增强 `log_audit()` 支持同一对象补全、启动校验映射表完整性
2. **Phase 2**：逐模块改造业务接口补全 `detail`（按优先级：集群域 → 系统域 → 观测域 → 自动化域），重点实现 UPDATE 前后对比
3. **Phase 3**：前端界面开发、权限配置（`audit_logs`）、菜单接入（feature+permission）、导出异步化、meta 接口
4. **Phase 4**：验收测试（全接口覆盖、批量、失败回滚、导出大文件）、文档更新

Rollback：移除 Hook 注册、撤销业务代码改动、删除前端文件、移除权限键 `audit_logs`、移除 feature flag `audit_log`。

## Open Questions

1. **操作名称规范**：`delete_route` vs `route_delete`？建议统一 `{resource}_{action}`（如 `route_delete`、`upstream_create`），便于筛选排序。**（已在映射表中采用 `{resource}_{action}` 格式）**
2. **IP 地址获取**：反向代理场景下需读 `X-Forwarded-For` 头，Hook 需配置 `trusted_proxies` 列表。
3. **审计日志保留策略**：是否需要定期清理/归档？（暂不实现，后续扩展）