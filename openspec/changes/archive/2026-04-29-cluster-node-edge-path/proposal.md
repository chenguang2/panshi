## Why

集群节点需要标识Edge节点路径，以便在多节点环境中区分和路由到具体的Edge节点。当前节点只有IP和端口信息，缺少路径标识。

## What Changes

1. **后端 - Node模型**: 添加 `edge_path` 字段（String(255), 必填）
2. **后端 - Pydantic Schema**: NodeBase、NodeCreate、NodeUpdate、NodeResponse 添加 `edge_path` 字段，带格式校验（必须以 `/` 开头）
3. **后端 - API**: create/update节点API支持 `edge_path` 字段
4. **前端 - 节点表单**: 添加"Edge路径"表单项，包含必填校验和格式校验
5. **前端 - 列配置**: `edge_path` 列默认不选中
6. **数据库迁移**: 添加 `edge_path` 列到 `ps_node` 表

## Capabilities

### New Capabilities
- `cluster-node-edge-path`: 节点Edge路径管理

### Modified Capabilities
- `cluster-management`: 节点管理新增必填字段

## Impact

| 层级 | 文件 | 改动 |
|------|------|------|
| Backend | `app/models/cluster.py` | Node模型添加edge_path列 |
| Backend | `app/schemas/cluster.py` | NodeBase等添加edge_path字段，带格式校验 |
| Backend | `app/api/v1/clusters.py` | create/update节点API |
| Backend | `alembic/versions/` | 数据库迁移脚本 |
| Frontend | `src/views/ClusterList.vue` | 表单添加字段、列配置添加字段 |
| Frontend | `src/views/ClusterList.vue` | `nodeColumnsSelected` 默认不含edge_path |
