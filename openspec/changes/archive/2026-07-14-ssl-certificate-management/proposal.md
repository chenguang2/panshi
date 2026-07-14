## Why

Edge 节点已支持 SSL 证书管理 API（`/edge/admin/ssl`），但磐石 Admin 尚未提供证书管理功能。用户需要 HTTPS 访问 Edge 网关时，只能通过 curl 等方式直接操作 Edge 节点 API，无法在管理平台统一管理证书。

Edge 的 SSL 证书通过 SNI（Server Name Indication）自动匹配，与路由无关。证书独立管理，发布到 Edge 节点后即可生效。

## What Changes

- 侧边栏新增"SSL 证书"菜单，独立页面 `/ssl`
- 卡片网格展示所有集群的 SSL 证书（数据存在 DB）
- 支持上传/编辑/删除/发布 SSL 证书到 Edge 节点
- 证书绑定到集群，发布时推送到该集群所有活跃节点
- 上游 `scheme` 下拉选项增加 `https`（Edge API 已支持）

## Capabilities

### New Capabilities
- `ssl-certificate-management`: SSL 证书的独立管理页面，包括 CRUD、发布到集群 Edge 节点

### Modified Capabilities
- `upstream-management`: 上游 scheme 下拉增加 `https` 选项

## Impact

| 范围 | 文件 | 说明 |
|---|---|---|
| 后端 | `backend/app/models/ssl.py` | 新增 SSL 证书 ORM 模型 |
| 后端 | `backend/app/schemas/ssl.py` | SSL 证书 Pydantic 模型 |
| 后端 | `backend/app/api/v1/cluster_ssl.py` | SSL 证书 CRUD + 发布 API |
| 后端 | `backend/app/services/edge_client.py` | 新增 `resource: "ssl"` 路径配置 |
| 后端 | `backend/app/api/v1/cluster_upstreams.py` | scheme 下拉增加 `https` |
| 前端 | `frontend/src/views/SslList.vue` | SSL 证书列表页 |
| 前端 | `frontend/src/components/SslFormDrawer.vue` | 上传/编辑证书 Drawer |
| 前端 | `frontend/src/router/index.ts` | 添加 `/ssl` 路由 |
| 前端 | `frontend/src/components/AppSidebar.vue` | 侧边栏菜单 |
| 前端 | `frontend/src/components/UpstreamFormModal.vue` | scheme 下拉增加 `https` |
