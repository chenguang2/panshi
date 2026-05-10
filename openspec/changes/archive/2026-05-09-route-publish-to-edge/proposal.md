## Why

路由发布功能需要将配置同步到 edge 服务器。目前上游（upstream）已经实现了发布到 edge 服务器的功能，但路由（route）只能保存版本历史，无法同步到 edge 服务器。这导致每个集群的路由配置需要手动在 edge 服务器上维护，不便于统一管理。

## What Changes

1. **新增路由发布 API**：修改 `POST /clusters/{cluster_id}/routes/{route_id}/publish` 接口，将路由同步到 edge 服务器
2. **复用 edge_client**：使用已有的 SM4 加密和 HTTP 通信能力
3. **复用 edge_logger**：记录路由发布操作的日志
4. **版本管理支持**：路由发布后保存版本记录到 `ps_config_version` 表
5. **路由格式转换**：将数据库路由格式转换为 edge API 格式

## Capabilities

### New Capabilities
- `route-sync`: 路由同步到 edge 服务器，包含发布接口、日志记录、版本管理

### Modified Capabilities
- (无) 目前 edge 服务器的路由 API 尚未使用

## Impact

- **后端 API**：`backend/app/api/v1/routes.py` - 修改 `publish_route` 函数
- **数据模型**：`ps_route` 表已有 `edge_uuid` 字段，支持唯一标识
- **边缘节点**：遍历集群中所有活跃节点（status=1）进行同步
- **配置版本**：`ps_config_version` 表记录路由版本历史
- **前端影响**：`ClusterList.vue` 中 `publishRoute` 和 `publishRouteByRecord` 函数需要更新以显示发布进度弹窗

## Edge Server Details

- **地址**：192.168.100.235
- **服务端口**：10180
- **管理端口**：11999
- **API 路径**：`PUT /edge/admin/routes/{edge_uuid}`
- **参考文档**：`docs/edge/Routes API_接口文档.pdf`