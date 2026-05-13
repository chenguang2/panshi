## Why

路由管理缺少插件组关联功能。Edge API 支持 `plugin_config_ids` 字段，允许路由引用多个插件组实现配置复用。

## What Changes

- 路由弹窗新增"插件组"Tab，展示可选插件组卡片
- 支持多选插件组，存盘时保存 `plugin_config_ids`
- 发布时 `plugin_config_ids` 写入 Edge 节点
- 集群插件组卡片插件标签可点击查看 JSON 配置

## Capabilities

### New Capabilities
- `route-plugin-groups`: 路由关联插件组功能

## Impact

- `backend/app/models/cluster.py` — Route 模型新增 plugin_config_ids
- `backend/app/schemas/route.py` — RouteCreate/Update/Response 新增字段及校验
- `backend/app/api/v1/routes.py` — CRUD/发布/回滚 支持 plugin_config_ids
- `backend/app/services/edge_client.py` — convert_route_to_edge_format 新增参数
- `frontend/src/views/ClusterList.vue` — 路由弹窗新增插件组 Tab + 集群卡片可点标签
