## 1. Bug1: 新建插件组可选插件列表为空

- [x] 1.1 修复 ClusterList.vue showAddPluginConfig 条件：去掉 `!cluster.plugin_configs &&`

## 2. Bug2: F5 后插件组 tab 和全局规则消失

- [x] 2.1 auth.ts store 初始化时从 localStorage 恢复 user 和 permissions
- [x] 2.2 login() 中保存 permissions 到 localStorage
- [x] 2.3 logout() 中清除 permissions 从 localStorage
- [x] 2.4 移除 DefaultLayout.vue 和 ClusterList.vue 中冗余的 onMounted user 恢复代码

## 3. Bug3: log_process logs 字段显示 [object Object]

- [x] 3.1 PluginEditorDrawer.vue buildFormDataFromConfig object 无 properties 时 JSON.stringify

## 4. 边缘节点权限守卫

- [x] 4.1 DefaultLayout.vue 边缘节点菜单加 v-if="authStore.hasPermission('edge_nodes')"
- [x] 4.2 router/index.ts 路由守卫加 permissions 检查

## 5. 测试

- [x] 5.1 新增 auth store 单元测试（6 cases）
- [x] 5.2 LSP 诊断通过，全部 60 个测试通过
