## Why

Edge 网关的 Route API 已支持 `enable_websocket` 字段，用于开启 WebSocket 代理支持。目前平台在路由管理中没有暴露此配置项，导致需要 WebSocket 支持的路由必须通过 Edge 直连 API 手动配置，无法在平台统一管理。

## What Changes

- 后端 Route 模型新增 `enable_websocket` 字段
- 后端 Schema（RouteCreate、RouteUpdate、RouteResponse）新增 `enable_websocket` 可选字段
- 前端路由编辑表单（RouteFormModal）基础配置页新增「启用 WebSocket」复选框，默认不选中
- 发布路由时将 `enable_websocket` 字段写入 Edge API 的 body
- 从 Edge 导入路由时解析 `enable_websocket` 字段
- 配置对比时比较 `enable_websocket` 字段

## Capabilities

### New Capabilities

- `route-websocket`: 路由级别 WebSocket 代理开关，支持在平台界面开启/关闭

### Modified Capabilities

- `route-management`: 路由基础配置新增 `enable_websocket` 字段
- `cluster-routes-composable`: 路由表单数据模型新增 `enable_websocket` 字段

## Impact

- 后端：`models/route.py`、`schemas/route.py`、`api/v1/cluster_routes.py`、`services/edge_sync.py`、`services/edge_import_service.py`、`api/v1/cluster_nodes.py`
- 前端：`RouteFormModal.vue`、`useClusterRoutes.ts`
- Edge publish：在 `edge_data` 中加入 `enable_websocket`
