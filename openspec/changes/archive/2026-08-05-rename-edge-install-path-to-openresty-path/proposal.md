## Why

字段 `edge_install_path` 名义上像"Edge 的安装路径"，实际存的是 **OpenResty/Nginx 安装路径**（如 `/work/jboss/uapm/openresty`），与 `edge_path`（Edge 程序目录 `/work/jboss/uapm/uap-edge`）容易混淆，是多次实现的误解来源。改名为 `openresty_path` 以点明真实语义。

## What Changes

- **字段重命名**：`edge_install_path` → `openresty_path`（数据库列、Pydantic schema、API 序列化、前端类型/组件/CSV 列头）
- **数据库迁移**：新增 `_rename_column` 迁移，将既有 `ps_node.edge_install_path` 列重命名为 `openresty_path`（数据保留，SQLite/PostgreSQL 均适用），并更新 `COLUMN_MIGRATIONS`
- **前端文案**：表单 label "Nginx安装路径" → "OpenResty安装路径"（与字段语义一致）
- **specs/docs**：活跃 spec 与架构文档同步新字段名

**BREAKING**: API 字段 `edge_install_path` 更名为 `openresty_path`；CSV 导入列头同步变更。无外部消费者，前后端同步修改。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `node-task-center`: 引用字段名由 `edge_install_path` 改为 `openresty_path`
- `edge-node-lifecycle`: 同上
- `cluster-data-export`: 导出列名同步
- `node-copy-batch-import`: CSV 列头同步

## Impact

- `backend/app/models/cluster.py`、`app/schemas/cluster.py`、`app/api/v1/nodes.py`、`cluster_install.py`、`cluster_export.py`、`app/services/node_task_service.py`
- `backend/app/core/migrate.py`：新增 `_rename_column` 迁移
- 前端 `types/index.ts`、`api/nodes.ts`、`composables/useClusterNodes.ts`、`utils/nodeImport.ts`、NodeList/ClusterNodes/CentralList/InstallOpenrestyDialog 组件及测试
- 数据库 `ps_node` 列名变更（数据保留）
