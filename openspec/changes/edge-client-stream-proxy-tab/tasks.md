## 1. EdgeClient — 新增 5 个 Stream Route 封装方法

- [x] 1.1 添加 `list_stream_routes()` → `self.api("stream_route", "list")`
- [x] 1.2 添加 `get_stream_route()` → `self.api("stream_route", "get", id)`
- [x] 1.3 添加 `create_stream_route()` → `self.api("stream_route", "create", data)`
- [x] 1.4 添加 `update_stream_route()` → `self.api("stream_route", "update", id, data)`
- [x] 1.5 添加 `delete_stream_route()` → `self.api("stream_route", "delete", id)`

## 2. edge_client.py API — 新增 5 个 Stream Route 代理端点

- [x] 2.1 添加 `GET /nodes/{ip}/{port}/stream-routes` 列表接口
- [x] 2.2 添加 `GET /nodes/{ip}/{port}/stream-routes/{id}` 详情接口
- [x] 2.3 添加 `POST /nodes/{ip}/{port}/stream-routes` 创建接口
- [x] 2.4 添加 `PUT /nodes/{ip}/{port}/stream-routes/{id}` 更新接口
- [x] 2.5 添加 `DELETE /nodes/{ip}/{port}/stream-routes/{id}` 删除接口

## 3. 前端 — EdgeClient.vue 新增四层代理 Tab

- [x] 3.1 添加 `streamRoutes` ref 和 `streamRouteSearch` ref
- [x] 3.2 添加 `loadStreamRoutes` 函数
- [x] 3.3 在 `loadAllData` 和 `loadData` 中加入 stream route 加载
- [x] 3.4 添加 a-tab-pane 模板（表格 + 搜索 + JSON 查看 + 删除）
- [x] 3.5 添加表格列定义 `streamRouteColumns`
- [x] 3.6 添加 JSON 查看和删除处理函数

## 4. Verification

- [x] 4.1 npm run build — clean build
- [x] 4.2 人工检查 Tab 显示和数据加载
