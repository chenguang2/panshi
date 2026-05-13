## Why

集群管理页缺少插件组（Plugin Configs）管理功能。插件组是一组可以在路由间复用的插件配置，用户需要能在一处配置多处使用。

## What Changes

- 集群管理新增"插件组"Tab，以卡片式仪表盘展示
- 支持插件组的增删改查 + 发布到 Edge 节点 + 版本管理
- 每个插件组可包含多个插件，每个插件单独配置参数

## Capabilities

### New Capabilities
- `cluster-plugin-groups`: 集群级别的插件组 CRUD、发布、版本管理

## Impact

- `backend/app/models/cluster.py` — 新增 PluginConfig 模型
- `backend/app/schemas/cluster.py` — 新增 PluginConfig 相关 schema
- `backend/app/api/v1/clusters.py` — 新增插件组 CRUD + 发布 API
- `frontend/src/views/ClusterList.vue` — 新增插件组 Tab 卡片 + 弹窗
- `frontend/src/components/VersionManagementModal.vue` — 扩展支持 plugin_config 类型
- `frontend/src/types/index.ts` — 新增 PluginConfig 类型
