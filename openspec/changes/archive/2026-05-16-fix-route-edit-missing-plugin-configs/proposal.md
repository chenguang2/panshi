## Why

在边缘节点直接管理页面（EdgeClient.vue）中编辑路由时，无法查看或选择关联的插件组（plugin_configs）。路由的 `plugin_config_ids` 字段在表单和 API 请求中完全缺失，导致已配置的插件组信息丢失，也无法为路由关联插件组。而主管理页面（ClusterList.vue）的同等功能是完整实现的。

## What Changes

- 在 `EdgeClient.vue` 的路由编辑弹窗中增加插件组（plugin_configs）选择功能
- `routeForm` 增加 `plugin_config_ids` 字段
- `showRouteModal` 编辑时从路由数据中加载 `plugin_config_ids`
- 表单 UI 增加插件组勾选列表（复用 `loadPluginConfigs` 已加载的数据）
- `handleRouteSubmit` 提交时携带 `plugin_config_ids` 字段

## Capabilities

### New Capabilities
- `edge-route-plugin-configs`: 边缘节点路由编辑时支持关联/取消关联插件组

### Modified Capabilities

无

## Impact

- **修改文件**: `frontend/src/views/EdgeClient.vue`
- **仅影响边缘节点直接编辑模式**，不影响主管理页面的路由编辑
- **不涉及后端改动**，后端 API 已支持 `plugin_config_ids`（`RouteCreate`/`RouteUpdate` schema 包含该字段）
