## 1. 前端: executeDeleteWithProgress 提取

- [x] 1.1 在 `useClusterUtils.ts` 中添加 `executeDeleteWithProgress(opts)` 函数
- [x] 1.2 更新 `useClusterUpstreams.ts` 使用新函数
- [x] 1.3 更新 `useClusterRoutes.ts` 使用新函数
- [x] 1.4 更新 `useClusterPluginConfigs.ts`、`useClusterGlobalRules.ts`、`useClusterStaticResources.ts` 使用新函数
- [x] 1.5 验证编译通过且发布/删除功能正常

## 2. 后端: _publish_to_nodes 提取

- [ ] 2.1 创建 `backend/app/api/v1/common.py`，添加 `_publish_to_nodes` 函数
- [ ] 2.2 更新 `clusters.py` 中 publish_upstream/publish_plugin_config/publish_global_rule 使用新函数
- [ ] 2.3 更新 `routes.py` 中 publish_route 使用新函数
- [ ] 2.4 更新 `plugin_metadata.py` 中 publish_plugin_metadata 使用新函数
- [ ] 2.5 更新 `static_resources.py` 中 publish_static_resource 使用新函数
- [ ] 2.6 验证编译通过且后端运行正常
