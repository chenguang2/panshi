## Why

删除集群时，关联的四层代理和 SSL 证书未被清理。删除 Edge 节点数据时未删除对应的 Edge 资源，删除数据库记录时未删除对应的 DB 记录（含版本历史），导致残留数据。

## What Changes

1. **Stats 端点**：`GET /{cluster_id}/stats` 返回增加 `stream_proxies` 和 `ssl_certificates` 计数。
2. **删除集群 — Edge 侧**：遍历并删除四层代理和 SSL 证书。
3. **删除集群 — DB 侧**：删除四层代理和 SSL 证书的数据库记录。
4. **前端资源标签**：`resourceLabels` 增加四层代理和 SSL 证书的显示名。

## Capabilities

### New Capabilities
_无_

### Modified Capabilities
- `cluster-management`: 删除集群时清理四层代理和 SSL 证书

## Impact

- **后端 Model**: `app/models/ssl.py` — `cluster_id` 增加 ForeignKey CASCADE
- **后端 API**: `app/api/v1/clusters.py` — stats 端点增加计数；delete 端点增删对应资源
- **后端 Service**: `app/services/edge_client.py` — 新增 `delete_ssl` 方法
- **前端**: `frontend/src/composables/useClusterUtils.ts` — `resourceLabels` 新增四层代理和 SSL 证书
