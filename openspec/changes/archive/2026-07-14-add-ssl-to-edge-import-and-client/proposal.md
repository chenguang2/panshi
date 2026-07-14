## Why

SSL 证书管理功能已实现独立 CRUD 页面，但 Edge 数据导入和 Edge 直连页面尚未支持 SSL 证书。数据导入时无法导入 Edge 节点上已有的证书；Edge 直连调试页面无法查看/操作 SSL 证书。

## What Changes

- Edge 数据导入（`EdgeImportService`）增加 SSL 证书的拉取、转换、冲突检测和导入
- Edge 直连调试页面（`EdgeClient.vue`）资源类型下拉增加 `ssl`，支持 GET 列表/详情、PUT 创建/更新、DELETE 删除

## Capabilities

### New Capabilities

无新增能力

### Modified Capabilities

- `edge-data-import`: 导入数据源增加 SSL 证书（`/edge/admin/ssl`），包括预览和执行
- `edge-client-manual-query`: Edge 直连页面资源类型增加 `ssl`

## Impact

| 范围 | 文件 | 说明 |
|---|---|---|
| 后端 | `backend/app/services/edge_import_service.py` | fetch_edge_data 增加 SSL 拉取、convert_plugin_metadata-like 转换、conflict 检测、execute_import 导入 |
| 后端 | `backend/app/services/edge_client.py` | RESOURCE_PATHS 已有 ssl，无需改动 |
| 前端 | `frontend/src/views/EdgeClient.vue` | 资源类型下拉增加 ssl |
