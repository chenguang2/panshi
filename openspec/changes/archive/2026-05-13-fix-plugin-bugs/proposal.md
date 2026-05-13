## Why

修复三个与权限和插件编辑相关的 Bug。

## What Changes

1. **Bug1** — 修复 `ClusterList.vue` 中 `showAddPluginConfig` 条件错误，`&&` 应为 `||` 或直接判断 `availablePlugins`，导致 `loadAvailablePlugins` 永远不会执行，非 admin 用户新建插件组时可选插件列表为空
2. **Bug2** — 修复 `auth.ts` 中 `permissions` 未持久化到 localStorage，F5 刷新后 `hasPermission` 返回 `false`，导致插件组 tab 和全局规则 tab 消失
3. **Bug3** — 修复 `PluginEditorDrawer.vue` 中 `buildFormDataFromConfig` 对无 `properties` 的 object 字段返回 `{}`，导致 `log_process` 元数据 `logs` 字段显示 `[object Object]`
4. **附加修复** — `DefaultLayout.vue` 和路由守卫增加 `edge_nodes` 权限检查，防止未授权用户访问边缘节点页面

## Capabilities

### New Capabilities
- `permission-persistence`: 用户权限持久化到 localStorage，F5 刷新后权限不丢失

### Modified Capabilities
（无现有 spec 被修改）

## Impact

- `frontend/src/stores/auth.ts` — permissions 持久化到 localStorage
- `frontend/src/views/ClusterList.vue` — showAddPluginConfig 条件修复
- `frontend/src/views/DefaultLayout.vue` — 边缘节点菜单加权限守卫
- `frontend/src/router/index.ts` — 路由守卫支持基于 meta.permission 的权限检查
- `frontend/src/components/PluginEditorDrawer.vue` — object 字段无 properties 时 JSON.stringify
- `frontend/vitest.config.ts` — 新增 @ alias 支持
- `frontend/src/stores/auth.test.ts` — 新增 auth store 测试
