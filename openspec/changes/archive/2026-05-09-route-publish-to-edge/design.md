## Context

路由发布功能需要将配置同步到 edge 服务器集群。目前上游（upstream）已经实现了完整的发布流程（参考 `publish_upstream` 函数），包括：
1. 多节点同步
2. SM4 加密通信
3. 操作日志记录
4. 版本管理

路由发布需要复用这套机制，但针对路由数据结构进行调整。

**Edge 服务器信息**：
- 地址：192.168.100.235
- 管理端口：11999
- API 路径：`PUT /edge/admin/routes/{edge_uuid}`

## Goals / Non-Goals

**Goals:**
- 路由发布 API 同步路由配置到所有活跃 edge 节点
- 复用 edge_client 和 edge_logger 模块
- 路由版本管理（保存、查看、回滚）
- 前端发布弹窗显示实时进度（复用 upstream 模式）

**Non-Goals:**
- 不修改 edge 服务器代码
- 不支持路由的部分同步（只支持全量发布）
- 不实现路由的自动发现或批量创建

## Decisions

### 1. 使用 edge_uuid 作为 Edge 唯一标识

**Decision**: 路由在 edge 服务器使用 `edge_uuid`（UUID）作为唯一标识。

**Rationale**:
- 避免数据库 ID 复用导致的数据覆盖问题（与 upstream 保持一致）
- 路由表已有 `edge_uuid` 字段

**Reference**: Upstream 使用 `upstream.edge_uuid` 作为 edge API 的 URL 路径参数

### 2. 路由数据格式转换

**Decision**: 将本地路由格式转换为 edge API 格式。

**Rationale**:
- 将转换逻辑和 edge 调用封装在 `edge_client.py` 模块中
- 与 upstream 保持一致的模式

**Edge Route 格式**（参考 `Routes API_接口文档.pdf`）：
```json
{
  "name": "route_name",
  "uri": "/api/*",
  "methods": ["GET", "POST"],
  "hosts": ["example.com"],
  "upstream_id": "<upstream_edge_uuid>",
  "plugins": {...}
}
```

**Conversion Logic**:
- 本地 `uri` → edge `uri`
- 本地 `methods` → edge `methods`
- 本地 `hosts` → edge `hosts`
- 本地 `upstream_id`（数据库 ID）→ 需要查询对应 upstream 的 `edge_uuid`
- 本地 `vars`, `advanced_match_enabled` → edge 高级匹配规则

### 3. 遍历所有活跃节点同步

**Decision**: 与 upstream 一样，遍历集群中所有 `status=1` 的节点进行同步。

**Rationale**:
- 保持与 upstream 行为一致
- 确保配置在所有边缘节点一致

### 4. 版本管理复用

**Decision**: 路由发布后创建 `ps_config_version` 记录，类型为 `route`。

**Reference**: `publish_upstream` 中版本管理逻辑（`clusters.py:468-496`）

### 5. edge_client.py 模块组织

**Decision**: 路由的 edge 调用和格式转换封装到 `edge_client.py`。

**Rationale**:
- 与 upstream 保持相同模式（upstream 也在 edge_client.py）
- `routes.py` 只负责版本管理，业务逻辑委托给 EdgeClient
- EdgeClient 提供统一的接口：`update_route()`, `convert_route_to_edge_format()`

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| edge 路由 API 不支持某些字段 | 参考文档实现，测试验证 |
| upstream_id 关联的 upstream 尚未发布到 edge | 发布前检查 upstream 的 edge_uuid 是否存在 |
| 路由配置转换复杂 | 简化转换逻辑，支持核心字段 |
| 多节点同步部分失败 | 返回 partial 状态，记录失败节点 |

## Migration Plan

1. 部署后端代码（包含新 API）
2. 前端通过 `publishRoute` / `publishRouteByRecord` 调用新 API
3. 日志记录到 `logs/edge/route.log`
4. 版本历史通过现有 `/clusters/{id}/routes/{route_id}/history` API 查看