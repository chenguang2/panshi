## Why

Edge 直连页面已支持上游、路由、全局规则、插件组、插件元数据等资源的直连查询和管理，但缺少四层代理（Stream Route）的支持。四层代理发布到 Edge 节点后，用户无法在 Edge 直连中查看、调试或管理已部署的 Stream Route，需要补充此能力。

## What Changes

- 后端 `edge_client.py` 新增 Stream Route 的 CRUD 代理接口（list、get、create、update、delete）
- 前端 `EdgeClient.vue` 新增「四层代理」标签页，展示 Stream Route 列表并提供 JSON 查看和删除操作
- 复用 `EdgeClient.api("stream_route", ...)` 通用方法调用 Edge 节点的 `/stream/edge/admin/routes` 接口

## Capabilities

### New Capabilities
- `edge-client-stream-route`: Edge 直连页面四层代理标签页，支持查看、JSON 查看、删除 Stream Route

### Modified Capabilities
- `unified-edge-client`: Edge 直连页面增加四层代理标签页

## Impact

- **后端**: `edge_client.py` 新增 5 个 Stream Route 路由端点（list、get、create、update、delete），约 60 行
- **前端**: `EdgeClient.vue` 新增一个标签页，包含表格、搜索、JSON 查看弹窗、删除功能，约 100 行
- **依赖**: 无新增外部依赖
