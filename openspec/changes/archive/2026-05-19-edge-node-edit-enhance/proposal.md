## Why

边缘节点管理界面的上游（Upstreams）和路由（Routes）编辑功能未完整实现——点击编辑按钮弹出 Modal 时能正常回填数据，但提交时仅提示"编辑模式暂未完整实现，请使用创建功能"，未调用后端 API。用户无法通过界面直接修改已有的上游或路由配置，只能删除重建。后端 PUT 更新端点已存在，只需在前端补充提交逻辑。

## What Changes

- **前端 EdgeClient.vue**：实现上游编辑提交逻辑（调用 `PUT .../upstreams/{id}`）
- **前端 EdgeClient.vue**：实现路由编辑提交逻辑（调用 `PUT .../routes/{id}`）
- **后端 edge_client.py**：新增上游 PATCH 端点（服务层 `patch_upstream` 已实现但未暴露）
- **后端 edge_client.py 及服务层**：新增路由 PATCH 端点和 `patch_route` 方法
- **后端 edge_client.py 及服务层**：新增插件元数据 PATCH 端点和 `update_plugin_metadata` 方法

## Capabilities

### New Capabilities
- `edge-upstream-edit`: 边缘节点上游资源的编辑功能（前端 PUT 提交 + 后端 PATCH 端点）
- `edge-route-edit`: 边缘节点路由资源的编辑功能（前端 PUT 提交 + 后端 PATCH 端点）
- `edge-metadata-patch`: 边缘节点插件元数据的 PATCH 更新端点

### Modified Capabilities

<!-- 不涉及现有 spec 需求变更 -->

## Impact

- 前端：`frontend/src/views/EdgeClient.vue` — 修改 `handleUpstreamSubmit` 和 `handleRouteSubmit` 函数
- 后端 API：`backend/app/api/v1/edge_client.py` — 新增 3 个 PATCH 路由
- 后端服务：`backend/app/services/edge_client.py` — 新增 `patch_route` 和 `update_plugin_metadata` 方法
