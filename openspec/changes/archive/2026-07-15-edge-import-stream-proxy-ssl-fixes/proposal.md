## Why

Edge 数据导入和直连功能中，SSL 证书信息缺失、四层代理导入存在多个数据丢失问题（节点数组格式、DNS 代理类型、重试配置），以及 SSL 证书 tab 页面弹窗风格不一致，影响功能完整性和用户体验。

## What Changes

1. **Edge 数据导入 — 测试连接结果增加 SSL 计数**：`test_connection()` 返回数据中新增 `ssl_certificate_count` 字段，前端展示 SSL 证书数量。
2. **Edge 数据导入 — 预览步骤增加 SSL 证书列表卡片**：预览界面新增 SSL 证书区域，支持选择/展开详情。
3. **Edge 数据导入 — 导入结果弹窗增加 SSL 证书统计**：结果弹窗新增 `SSL 证书：N 个` 行。
4. **四层代理导入 — 修复节点数组格式**：Edge API 的 `upstream.nodes` 支持 dict 和 array 两种格式，`convert_stream_proxy` / `convert_upstream` 新增 `_parse_nodes()` 方法处理 array 格式。
5. **四层代理导入 — 支持 DNS 代理类型**：识别 `plugins.dns_upstream` 数据，设置 `proxy_type = "dns"`，正确存储 `dns_config` 和合并 `log_process` 插件。
6. **四层代理导入 — 修复重试配置丢失**：`convert_stream_proxy` 新增读取 `upstream.retries` / `upstream.retry_timeout`。
7. **四层代理导入 — 修复协议错误**：DNS 类型代理的 `scheme` 设为 `"udp"` 而非 `"tcp"`。
8. **Edge 直连 — SSL 证书 tab 移到四层代理右侧**：调整 tab 顺序。
9. **Edge 直连 — SSL 证书操作弹窗统一风格**：查看改为 JSON 弹窗，删除改为 `Modal.confirm`。

## Capabilities

### New Capabilities
- _(无新能力，均为对现有能力的修改)_

### Modified Capabilities
- `edge-data-import`: 测试连接返回 SSL 计数；预览步骤展示 SSL 证书列表；导入结果弹窗展示 SSL 计数
- `edge-import-stream-proxy`: 支持 nodes 数组格式；支持 DNS 代理类型；保留 retries/retry_timeout 配置；DNS 类型 scheme 修正为 udp
- `edge-client-stream-route`: SSL 证书 tab 移至四层代理右侧
- `ssl-certificate-management`: SSL 证书查看/删除弹窗风格与页面统一

## Impact

- **后端**: `app/services/edge_import_service.py` — 新增 `_parse_nodes()` 方法，重写 `convert_stream_proxy()` 分支逻辑
- **后端**: `app/schemas/edge_import.py` — 新增 `SslCertificatePreview`、`ssl_certificate_count` / `ssl_certificates` 字段
- **前端**: `frontend/src/views/EdgeImport.vue` — 连接结果、预览卡片、导入结果弹窗展示 SSL；`handleCancel` 补充重置
- **前端**: `frontend/src/api/edgeImport.ts` — 补充 SSL 相关响应类型
- **前端**: `frontend/src/views/EdgeClient.vue` — tab 顺序调整、SSL 弹窗改用 JSON modal + Modal.confirm
- **测试**: `tests/test_edge_import.py` — 新增 12 个测试用例覆盖 array 格式节点、DNS 类型、retries 等场景
