## 1. Schema 更新

- [x] 1.1 RoutePreview schema 添加 `remote_addrs`、`vars` 字段

## 2. 导入转换逻辑

- [x] 2.1 convert_route() 添加 `remote_addrs`、`vars`、`advanced_match_enabled` 字段映射

## 3. 预览逻辑

- [x] 3.1 preview_import() routes_preview 添加 `vars`、`remote_addrs` 展示

## 4. 验证

- [x] 4.1 LSP diagnostics 检查改动文件（basedpyright 未安装，Python 语法检查通过）
- [x] 4.2 确认向后兼容性（已有导入数据不受影响）
