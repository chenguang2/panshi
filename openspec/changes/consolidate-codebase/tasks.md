## 1. 清理 ClusterList.vue 死代码

- [x] 1.1 删除模板中路由内联弹窗（lines 177-283）
- [x] 1.2 删除模板中插件组/全局规则/静态资源弹窗（lines 285-365）
- [x] 1.3 删除 View 抽屉和 VersionManagementModal（lines 367-425）
- [x] 1.4 清理脚本层未使用的 composable 解构
- [x] 1.5 验证编译通过且功能正常

## 2. 后端 EdgeLogger 统一

- [ ] 2.1 在 `EdgeLogger` 中添加 `log_operation(resource_type, ...)` 通用方法，含 `resource_type → log_file/label` 映射
- [ ] 2.2 将 5 个旧 `log_xxx_operation` 方法改为代理到 `log_operation`
- [ ] 2.3 更新所有调用点改用 `log_operation`（api/v1/ 下各 endpoint）

## 3. 后端 EdgeClient 通用 api 方法

- [ ] 3.1 在 `EdgeClient` 中添加 `api(resource, action, resource_id=None, data=None)` 方法，含 `RESOURCE_PATHS` 和 `action → method` 映射
- [ ] 3.2 将 29 个资源方法改为代理到 `api()`
- [ ] 3.3 更新 api/v1/edge_client.py 中的调用点

## 4. 前端 publish/delete 提取到 useClusterUtils.ts

- [ ] 4.1 在 `useClusterUtils.ts` 中添加 `executePublish(options)` 函数
- [ ] 4.2 在 `useClusterUtils.ts` 中添加 `buildDeleteProgressHandler(options)` 工厂函数
- [ ] 4.3 更新 `useClusterUpstreams.ts` 使用新函数
- [ ] 4.4 更新 `useClusterRoutes.ts` 使用新函数
- [ ] 4.5 更新 `useClusterPluginConfigs.ts`、`useClusterGlobalRules.ts`、`useClusterStaticResources.ts` 使用新函数
- [ ] 4.6 移除不再需要的 `h` 导入
- [ ] 4.7 验证编译通过且发布/删除功能正常
