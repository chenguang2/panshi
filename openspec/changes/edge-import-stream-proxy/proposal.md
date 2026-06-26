## Why

Edge 数据导入（EdgeImport）目前支持上游、路由、插件组、全局规则、插件元数据五种资源的批量导入，但缺少四层代理（Stream Route）。四层代理发布到 Edge 节点后，用户无法通过数据导入功能将其拉取到管理平台，需要手动逐条创建，效率低下。

## What Changes

- 后端 `edge_import_service.py` 新增 Stream Route 的抓取、转换、冲突检测、导入逻辑
- 后端 `schemas/edge_import.py` 的 `ImportSelection` 新增 `stream_proxy` 字段
- 后端 `models/edge_import.py` 的 `ImportLog` 新增 `stream_proxy_count` 字段
- 前端 `EdgeImport.vue` 的 `configTypes` 和 `selections` 新增四层代理选项
- 导入顺序：四层代理放在路由之前（与上游同级）

## Capabilities

### New Capabilities
- `edge-import-stream-proxy`: Edge 数据导入支持四层代理的批量抓取、预览、冲突检测和导入

### Modified Capabilities
- `edge-data-import`: 数据导入配置类型从 5 种扩展到 6 种

## Impact

- **后端**: `edge_import_service.py` 约 100 行新增（fetch + convert + conflict detect + import）；`edge_import.py` schema 和 `models/edge_import.py` 各 1 字段
- **前端**: `EdgeImport.vue` 约 15 行（configTypes 加一项 + selections 加一项）
- **测试**: `tests/test_edge_import.py` 需补充 stream_proxy 相关测试
