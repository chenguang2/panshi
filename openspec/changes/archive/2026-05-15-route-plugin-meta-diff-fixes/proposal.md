## Why

配置对比功能发现多处 bug 和遗漏：插件元数据无法正确从 Edge 查询和对比，路由对比缺少高级匹配/插件组/插件字段。

## What Changes

- 修复 `edge_plugin_metadatas` 键提取：从节点 key 路径提取插件名
- 修复 `_compare_plugin_metadata`：Edge 数据无 `config` 包装层，直接使用
- 路由对比补充 `vars`（高级匹配）、`plugin_config_ids`（插件组）、`plugins`（路由级插件）
- 前端路由编辑表单添加请求方法「全选」按钮

## Capabilities

### Modified Capabilities
- `config-diff`: 修复插件元数据对比 bug，路由对比补充缺失字段
- `cluster-management`: 路由编辑表单添加全选请求方法

## Impact

- `backend/app/api/v1/clusters.py` — 多处修改
- `frontend/src/views/ClusterList.vue` — 添加全选 UI
