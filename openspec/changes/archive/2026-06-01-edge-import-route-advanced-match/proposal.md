## Why

Edge 数据导入路由时，`vars`（高级匹配表达式）、`remote_addrs`（客户端 IP 匹配）和 `advanced_match_enabled` 三个字段未被导入，导致从 Edge 导入的路由丢失高级匹配配置。用户需在导入后手动重新配置高级匹配规则。

## What Changes

- **EdgeImportService.convert_route()**: 添加 `remote_addrs`、`vars`、`advanced_match_enabled` 三个字段的映射
- **preview_import()**: 路由预览中添加 `vars`、`remote_addrs` 字段展示
- **RoutePreview schema**: 添加 `remote_addrs`、`vars` 字段定义
- **edge-data-import spec**: 补充路由高级匹配字段的转换说明

## Capabilities

### New Capabilities

（无新增 capability，仅修改既有 capability 的 requirements）

### Modified Capabilities

- `edge-data-import`: 路由数据转换与导入 - 增加高级匹配字段（`vars`、`remote_addrs`、`advanced_match_enabled`）的导入要求

## Impact

- `backend/app/services/edge_import_service.py` — `convert_route()` 和 `preview_import()` 方法
- `backend/app/schemas/edge_import.py` — `RoutePreview` 增加字段
