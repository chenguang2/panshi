## 1. 前端：上游编辑提交

- [ ] 1.1 在 `handleUpstreamSubmit` 的编辑分支中，调用 `api.put()` 向 `.../upstreams/${upstreamModalRecord.value.id}` 提交更新
- [ ] 1.2 编辑成功后刷新上游列表、关闭 Modal、显示成功提示
- [ ] 1.3 编辑失败时显示错误提示

## 2. 前端：路由编辑提交

- [ ] 2.1 在 `handleRouteSubmit` 的编辑分支中，调用 `api.put()` 向 `.../routes/${routeModalRecord.value.id}` 提交更新
- [ ] 2.2 编辑成功后刷新路由列表、关闭 Modal、显示成功提示
- [ ] 2.3 编辑失败时显示错误提示

## 3. 后端：新增 PATCH 端点

- [ ] 3.1 在 `edge_client.py` API 层新增 `PATCH /nodes/{ip}/{port}/upstreams/{upstream_id}` 端点（服务层 `patch_upstream` 已就绪）
- [ ] 3.2 在 `edge_client.py` 服务层新增 `patch_route` 方法，API 层新增 `PATCH /nodes/{ip}/{port}/routes/{route_id}` 端点
- [ ] 3.3 在 `edge_client.py` 服务层新增 `update_plugin_metadata` 方法，API 层新增 `PATCH /nodes/{ip}/{port}/plugin_metadata/{plugin_name}` 端点
