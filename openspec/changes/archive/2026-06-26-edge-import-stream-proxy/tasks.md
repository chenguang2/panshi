## 1. Schema — ImportSelection 新增 stream_proxy 字段

- [ ] 1.1 `backend/app/schemas/edge_import.py` 的 `ImportSelection` 增加 `stream_proxy: bool = True`

## 2. Model — ImportLog 新增 stream_proxy_count 字段

- [ ] 2.1 `backend/app/models/edge_import.py` 增加 `stream_proxy_count` 列

## 3. Service — edge_import_service.py 新增 Stream Route 导入逻辑

- [ ] 3.1 `fetch_edge_data()` 中增加 Stream Route 抓取
- [ ] 3.2 添加 `convert_stream_proxy()` 格式转换方法
- [ ] 3.3 添加 `_detect_stream_proxy_conflicts()` 冲突检测
- [ ] 3.4 `preview_import()` 中增加 Stream Route 预览
- [ ] 3.5 `execute_import()` 中增加 Stream Route 导入（在 plugin_metadata 之后）
- [ ] 3.6 `test_connection()` 中增加 Stream Route 计数
- [ ] 3.7 `_parse_resource_list()`/`_unwrap_panshi_items()` 适配 stream_route 返回格式

## 4. Frontend — EdgeImport.vue 增加四层代理选项

- [ ] 4.1 `configTypes` 增加四层代理卡片项
- [ ] 4.2 `selections` 增加 `stream_proxy: true`

## 5. Verification

- [ ] 5.1 后端 pytest 通过
- [ ] 5.2 前端 npm run build 通过
