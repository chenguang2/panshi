## 1. 抽取 edge_sync.py 共享模块

- [ ] 1.1 创建 `backend/app/services/edge_sync.py`，实现 `sync_to_nodes()` 统一同步函数
- [ ] 1.2 将 clusters.py 中的7处 `for node + EdgeClient` 替换为 `sync_to_nodes()`
- [ ] 1.3 将 routes.py 中的3处 `for node + EdgeClient` 替换为 `sync_to_nodes()`
- [ ] 1.4 将 plugin_metadata.py 中的2处 `for node + EdgeClient` 替换为 `sync_to_nodes()`
- [ ] 1.5 验证替换后不影响原有错误处理和日志行为

## 2. 拆分 clusters.py

- [ ] 2.1 创建 `cluster_upstreams.py`，迁移 upstream CRUD + publish/rollback/history
- [ ] 2.2 创建 `cluster_plugin_configs.py`，迁移 plugin_config CRUD + publish/rollback/history
- [ ] 2.3 创建 `cluster_global_rules.py`，迁移 global_rule CRUD + publish/rollback/history
- [ ] 2.4 创建 `cluster_nodes.py`，迁移 node CRUD + start/stop/status
- [ ] 2.5 更新 `backend/app/api/v1/__init__.py` 统一挂载所有子 router
- [ ] 2.6 清理 clusters.py 中已迁移的函数和导入

## 3. 抽取 plugins.py 数据

- [ ] 3.1 创建 `backend/app/config/plugin_definitions.py`，迁移插件数据定义
- [ ] 3.2 精简 `plugins.py` 为只导入数据 + 路由

## 4. 修复 useClusterNodes.ts

- [ ] 4.1 `deleteNode` 中替换内联 API 调用为 `executeDeleteWithProgress`
- [ ] 4.2 验证删除流程一致

## 5. 验证

- [ ] 5.1 LSP 诊断通过，无类型错误
- [ ] 5.2 前端构建通过
- [ ] 5.3 后端语法检查通过
