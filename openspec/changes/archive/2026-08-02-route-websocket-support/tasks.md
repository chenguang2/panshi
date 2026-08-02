## 1. 数据库迁移

- [x] 1.1 `models/route.py`: Route 模型新增 `enable_websocket`（Boolean, default=False）字段
- [x] 1.2 `core/migrate.py`: 在 COLUMN_MIGRATIONS 中添加 `enable_websocket` 迁移条目

## 2. 后端 Schema

- [x] 2.1 `schemas/route.py`: RouteBase 新增 `enable_websocket: Optional[bool] = None`
- [x] 2.2 `schemas/route.py`: RouteCreate、RouteUpdate 继承新增字段
- [x] 2.3 `schemas/route.py`: RouteResponse 继承新增字段

## 3. 后端 API

- [x] 3.1 `api/v1/cluster_routes.py`: 创建/更新路由时处理 `enable_websocket`
- [x] 3.2 `api/v1/cluster_routes.py`: 发布路由时在 `config_data`（版本历史）和 `edge_data`（Edge 发布）中均包含 `enable_websocket`
- [x] 3.3 `services/edge_client.py`: `convert_route_to_edge_format()` 新增 `enable_websocket` 参数
- [x] 3.4 `api/v1/cluster_routes.py`: `rollback_route()` 从 `config_data` 恢复 `enable_websocket`

## 4. Edge 导入

- [x] 4.1 `services/edge_import_service.py`: 在 `convert_route()` 中解析 `enable_websocket`

## 5. 配置对比

- [x] 5.1 `api/v1/cluster_nodes.py`: 在路由配置对比中添加 `enable_websocket` 字段比较

## 6. 前端表单

- [x] 6.1 `RouteFormModal.vue`: 基础配置页新增「启用 WebSocket」复选框
- [x] 6.2 `RouteFormModal.vue`: 编辑时回填 `enable_websocket` 状态
- [x] 6.3 `useClusterRoutes.ts`: 路由表单数据模型新增 `enable_websocket` 字段
- [x] 6.4 `useClusterRoutes.ts`: 创建/更新路由时提交 `enable_websocket`
