## Why

前后端代码中存在积累的死代码（未使用的组件、函数、import）、重复逻辑（多处相同的工具函数和模式）以及两个 Bug（模型未注册、变量名复制粘贴错误）。需要系统性清理，降低维护成本和潜在运行时故障。

## What Changes

**后端：**
- 修复 `models/__init__.py` 缺少 `StaticResource` 模型注册的 Bug
- 修复 `clusters.py` 中 `delete_plugin_config` 复制粘贴错误（`upstream_id` → `config_id`）
- 删除 `plugins.py` 中 6 个未使用的 import
- 删除 `plugin_metadata.py` 中未使用的 `AuditLog` import
- 删除 `auth.py` 中未使用的 `hash_password` import
- 删除 `models/cluster.py` 中未使用的 `relationship` import
- 删除 `core/seed.py` 中未使用的 `seed_admin()` 函数
- 删除 `core/security.py` 中未使用的 `get_password_hash_cost()` 函数
- 删除 `core/__init__.py` 中未使用的 `get_db_url` 导出
- 删除 `api/v1/plugins-BACKUP.py` 备份文件
- 移除 `auth.py` 中两个空壳端点（`GET /auth/me`、`PUT /auth/password`）

**前端：**
- 删除 3 个未使用的组件（`HelloWorld.vue`、`TwoColumnPluginSelector.vue`、`DraggablePluginGrid.vue`）
- 删除 3 个未使用的资源文件
- 删除 `stores/auth.ts` 中未使用的 `fetchCurrentUser`、`fetchPermissions`
- 删除 `stores/theme.ts` 中未使用的 `setSidebarCollapsed`
- 删除 `useClusterUtils.ts` 中 4 个未使用的函数
- 删除 `ClusterList.vue` 中 4 个未使用的图标 import
- 删除 `PluginEditorDrawer.vue` 中未使用的 `fullJsonConfig`
- 删除 `UserList.vue` 中空函数 `onPermissionChange`
- 删除 `router/index.ts` 中死路由
- 清理 `ClusterList.vue` 中重复的 CSS
- 合并 `buildDeleteProgressContent`（4 份 → 1 份）
- 合并 `formatDate`（5 份 → 1 份）
- 合并 `getClusterUpstreams`（3 份 → 1 份）

## Capabilities

### New Capabilities
- `codebase-cleanup`: 前后端代码清理与重复逻辑合并

### Modified Capabilities

无。不涉及现有 spec 行为变更。

## Impact

- `backend/app/models/__init__.py`：新增 import
- `backend/app/api/v1/clusters.py`：修复 Bug
- `backend/app/api/v1/plugins.py`、`plugin_metadata.py`、`auth.py`：清理 import
- `backend/app/models/cluster.py`、`core/seed.py`、`core/security.py`、`core/__init__.py`：清理
- 前端 6 个 `.vue` 文件、3 个 `.ts` 文件：清理/删除
- `frontend/src/composables/useClusterUtils.ts`：新增共享工具函数
- 无 API 变更，无数据库变更
