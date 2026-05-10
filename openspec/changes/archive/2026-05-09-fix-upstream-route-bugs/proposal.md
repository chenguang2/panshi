## Why

上游和路由存在两个 bug 需要修复：
1. 添加上游时缺少健康检查配置，需要默认启用被动和主动健康检查
2. 路由的插件（plugins）配置在版本管理和发布到边缘节点后丢失，需要排查根本原因

## What Changes

1. **上游健康检查默认值**
   - 在 `ClusterList.vue` 的 `showAddUpstreamModal` 中，添加上游时默认包含健康检查 JSON 配置
   - 配置包含 `passive` 和 `active` 两种健康检查策略

2. **路由插件丢失问题**
   - 排查路由 "ABCEFG" 等的插件在版本管理和边缘发布后丢失的问题
   - 检查 `publish_route`、`convert_route_to_edge_format` 中插件数据的处理流程
   - 验证 `RoutePlugin` 表中的 `config` 字段是否正确序列化和反序列化

## Capabilities

### New Capabilities
- `upstream-health-check-default`: 上游健康检查默认配置能力

### Modified Capabilities
- `route-sync`: 路由发布到边缘节点的能力（需要修复插件丢失问题）

## Impact

### 受影响的代码
- `frontend/src/views/ClusterList.vue`: `showAddUpstreamModal` 函数
- `backend/app/api/v1/routes.py`: `publish_route` 函数
- `backend/app/services/edge_client.py`: `convert_route_to_edge_format` 函数
- `backend/app/models/cluster.py`: `RoutePlugin` 模型
- `backend/app/schemas/route.py`: `PluginConfig` 和 `PluginUpdateRequest`

### 受影响的测试
- `frontend/e2e/upstream.spec.ts`: 上游相关 E2E 测试
- `frontend/e2e/route-publish.spec.ts`: 路由发布 E2E 测试