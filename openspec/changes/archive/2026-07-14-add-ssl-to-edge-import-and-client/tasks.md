## 1. 数据导入 — SSL 证书支持

- [x] 1.1 `fetch_edge_data()` 增加 SSL 证书拉取（`client.api("ssl", "list")`）
- [x] 1.2 新增 `convert_ssl_certificate()` 转换 Edge SSL 格式 → DB 格式（字段映射见 design.md）
- [x] 1.3 preview_import 中增加 SSL 预览展示
- [x] 1.4 detect_conflicts 中增加 SSL 冲突检测（按 edge_uuid）
- [x] 1.5 execute_import 中增加 SSL 导入逻辑（含 ConfigVersion 创建）
- [x] 1.6 EdgeImport.vue 的 configTypes 增加 ssl 选项
- [x] 1.7 后端 ImportSelection schema 增加 ssl 字段

## 2. Edge 直连 — SSL Tab

- [x] 2.1 `EdgeClient.vue` 新增 SSL 证书 Tab（表格 + 操作按钮）

## 3. 验证

- [x] 3.1 数据导入预览/执行 SSL 证书正常
- [x] 3.2 Edge 直连 SSL tab 列表/查看/删除正常
