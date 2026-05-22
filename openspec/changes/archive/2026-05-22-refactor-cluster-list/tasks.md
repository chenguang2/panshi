## 1. 创建目录结构和基础设施

- [x] 1.1 创建 `frontend/src/composables/` 目录
- [x] 1.2 创建 `frontend/src/views/clusters/` 目录
- [x] 1.3 创建 composable 通用工具函数（如 API 调用封装、分页参数处理）

## 2. Phase 1 — 抽取 Composables

- [x] 2.1 抽取 `useClusterNodes` composable（节点加载、增删改查、发布、状态、启停）
- [x] 2.2 抽取 `useClusterUpstreams` composable（上游加载、增删改查、发布、版本管理）
- [x] 2.3 抽取 `useClusterRoutes` composable（路由加载、增删改查、复制、发布、插件加载）
- [x] 2.4 抽取 `useClusterPluginConfigs` composable（插件配置加载、增删改查、版本管理）
- [x] 2.5 抽取 `useClusterGlobalRules` composable（全局规则加载、增删改查、版本管理）
- [x] 2.6 抽取 `useClusterStaticResources` composable（静态资源加载、增删改查、上传、发布、版本管理）
- [x] 2.7 ClusterList.vue 引入 composables 替代内联逻辑
- [x] 2.8 验证：`npm run build` 通过，各 tab 功能正常

## 3. Phase 2 — 拆分子组件

- [x] 3.1 创建 `ClusterNodes.vue` 子组件（节点表格 + 操作按钮 + modal）
- [x] 3.2 创建 `ClusterUpstreams.vue` 子组件（上游表格 + 操作按钮 + modal）
- [x] 3.3 创建 `ClusterRoutes.vue` 子组件（路由表格 + 操作按钮 + modal）
- [x] 3.4 创建 `ClusterPluginConfigs.vue` 子组件（插件配置卡片 + modal）
- [x] 3.5 创建 `ClusterGlobalRules.vue` 子组件（全局规则卡片 + modal）
- [x] 3.6 创建 `ClusterStaticResources.vue` 子组件（资源列表 + modal）
- [x] 3.7 精简 ClusterList.vue 模板为容器（tab 切换 + 子组件引用 + 列表头）
- [x] 3.8 验证：`npm run build` 通过，各 tab 功能正常

## 4. 收尾

- [x] 4.1 删除 ClusterList.vue 中已被抽取的冗余代码
- [x] 4.2 检查各组件 props/emits 类型定义完整
- [x] 4.3 `npm run build` 全量通过
