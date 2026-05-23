## 1. 修复后端 Bug

- [ ] 1.1 `models/__init__.py`：添加 `from app.models import static_resource`
- [ ] 1.2 `clusters.py`：修复 `delete_plugin_config` 中 `upstream_id` → `config_id`、`upstream` → `config`

## 2. 清理后端死代码

- [ ] 2.1 `plugins.py`：删除 6 个未使用的 import
- [ ] 2.2 `plugin_metadata.py`：删除未使用的 `AuditLog` import
- [ ] 2.3 `auth.py`：删除未使用的 `hash_password` import，删除两个空壳端点
- [ ] 2.4 `models/cluster.py`：删除未使用的 `relationship` import
- [ ] 2.5 `core/seed.py`：删除未使用的 `seed_admin()` 函数
- [ ] 2.6 `core/security.py`：删除未使用的 `get_password_hash_cost()` 函数
- [ ] 2.7 `core/__init__.py`：删除未使用的 `get_db_url` 导出
- [ ] 2.8 删除 `api/v1/plugins-BACKUP.py` 备份文件

## 3. 清理前端死代码

- [ ] 3.1 删除 3 个未使用组件 + 3 个资源文件
- [ ] 3.2 `stores/auth.ts`：删除 `fetchCurrentUser`、`fetchPermissions`
- [ ] 3.3 `stores/theme.ts`：删除 `setSidebarCollapsed`
- [ ] 3.4 `useClusterUtils.ts`：删除 4 个未使用的函数
- [ ] 3.5 `ClusterList.vue`：删除 4 个未使用的图标 import
- [ ] 3.6 `PluginEditorDrawer.vue`：删除 `fullJsonConfig`
- [ ] 3.7 `UserList.vue`：删除空函数 `onPermissionChange`
- [ ] 3.8 `router/index.ts`：删除死路由
- [ ] 3.9 `ClusterList.vue`：清理重复 CSS

## 4. 合并重复逻辑

- [ ] 4.1 将 `buildDeleteProgressContent` 合并到 `useClusterUtils.ts`（4 处调用方改为引用共享版本）
- [ ] 4.2 将 `formatDate` 合并到 `useClusterUtils.ts`（5 处调用方改为引用共享版本）
- [ ] 4.3 统一 `getClusterUpstreams`（3 处改为引用同一个版本）

## 5. 验证

- [ ] 5.1 `npm run build` 通过
- [ ] 5.2 `cd backend && uv run python -c "from app.models import static_resource; print('OK')"` 验证模型注册
