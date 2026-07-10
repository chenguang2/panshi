## Why

Edge 数据导入的预览步骤（preview_import）中，`fetch_edge_data()` 逐个获取各类 Edge 资源时没有异常处理。当某个资源接口在 Edge 节点上不存在（如 184-app 集群的 plugin_metadata 返回 404），整个预览会崩溃报错。需要让预览能容错运行，并给用户明确提示。

## What Changes

- `fetch_edge_data()` 各资源获取改为 try/except，失败时加入 warnings 列表
- 预览响应新增 `warnings` 字段，前端展示黄色警告提示
- 后端新增日志文件 `logs/app.log`，记录 WARNING 及以上级别日志

## Capabilities

### New Capabilities

无新增能力

### Modified Capabilities

- `edge-data-import`: 「数据预览」要求在部分资源获取失败时能容错展示其他资源，并给出警告提示

## Impact

| 影响范围 | 文件 | 改动类型 |
|---|---|---|
| 后端导入服务 | `backend/app/services/edge_import_service.py` | fetch_edge_data 加异常处理 + warnings |
| 后端日志配置 | `backend/app/main.py` | logging.basicConfig 写文件 |
| Schema | `backend/app/schemas/edge_import.py` | ImportPreviewResponse 加 warnings 字段 |
| 前端 API 类型 | `frontend/src/api/edgeImport.ts` | PreviewResponse 加 warnings |
| 前端预览页面 | `frontend/src/views/EdgeImport.vue` | 警告提示 UI |
