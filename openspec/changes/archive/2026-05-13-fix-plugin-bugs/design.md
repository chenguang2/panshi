## Context

当前系统存在多个与权限和表单渲染相关的 Bug：

1. `showAddPluginConfig` 中条件 `!cluster.plugin_configs && availablePlugins.value.length === 0` 使用了 `&&`，但 `loadPluginConfigs` 执行后 `cluster.plugin_configs` 永远为 truthy，导致 `loadAvailablePlugins()` 永远不会执行
2. `auth.ts` login 保存 token/user 到 localStorage，但 permissions 未保存；F5 后 permissions 为 `[]`
3. `buildFormDataFromConfig` 对 `type: "object"` 但无 `properties` 的字段递归调用空 schema 返回 `{}`
4. `DefaultLayout` 和路由未对 `edge_nodes` 权限做检查

## Goals / Non-Goals

**Goals:**
- 修复新建插件组时可选插件列表为空
- 修复 F5 后插件组 tab 和全局规则 tab 消失
- 修复 log_process 元数据 logs 字段显示 [object Object]
- 边缘节点页面增加权限守卫

**Non-Goals:**
- 不修改后端代码
- 不修改其他权限校验逻辑

## Decisions

### Bug1: showAddPluginConfig 条件修复
将 `!cluster.plugin_configs &&` 去掉，只判断 `availablePlugins.value.length === 0`，与其他函数（editPluginConfig, showAddGlobalRule）保持一致。

### Bug2: permissions 持久化
在 auth store 初始化时从 localStorage 恢复 `user` 和 `permissions`。在 login/logout 时分别保存/清理。

### Bug3: object 字段无 properties
`buildFormDataFromConfig` 中 object case：有 properties 时递归，无 properties 时直接 `JSON.stringify`。

### 边缘节点权限
`DefaultLayout` 菜单加 `v-if="authStore.hasPermission('edge_nodes')"`，路由加 `meta.permission` 和 `beforeEach` 守卫。

## Risks / Trade-offs
- 无显著风险，修复范围明确，测试覆盖 auth store 行为
