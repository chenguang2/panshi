## Why

路由列表页目前支持按集群、上游、发布状态等条件筛选，但无法按路由挂载的插件筛选。当路由数量较多时，运营人员需要快速找到使用了特定插件（如 `limit-req`、`key-auth`）的路由进行批量管理。增加插件筛选条件可以大幅提升路由管理效率。

## What Changes

- 路由列表 page 过滤栏新增一个「插件」下拉框
- 后端路由列表 API 新增可选的 `plugin` 查询参数，按插件名称过滤路由
- 前端 `RouteList.vue` 新增插件筛选逻辑，联动后端过滤
- 插件列表数据源使用已有 `/plugins/builtin` 接口获取内置插件列表

## Capabilities

### New Capabilities
- `route-plugin-filter`: 路由管理页面按插件名称过滤展示路由

### Modified Capabilities

- `route-management`: 路由列表和查询能力扩展，新增 plugin 查询参数

## Impact

- 后端: `backend/app/api/v1/routes.py` 中 `list_all_routes` 函数新增 `plugin` 可选参数，查询时联表 `route_plugin` 表按插件名过滤
- 前端: `frontend/src/views/RouteList.vue` 新增插件下拉框，请求时传递 `plugin` 参数
- 前端: 需要加载插件列表 (`/plugins/builtin`) 作为下拉选项的数据源
- 无新依赖，不涉及破坏性变更
