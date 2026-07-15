## 1. 后端 Schema — 增加 SSL 证书相关字段

- [x] 1.1 TestConnectionResponse 新增 `ssl_certificate_count` 字段
- [x] 1.2 定义 `SslCertificatePreview` schema（name, sni, cert_type, edge_uuid）
- [x] 1.3 ImportPreviewResponse 新增 `ssl_certificates` 字段
- [x] 1.4 ImportCounts 新增 `ssl_certificates` 字段

## 2. 后端 Service — 测试连接增加 SSL 计数

- [x] 2.1 `test_connection()` 中调用 Edge API 获取 SSL 证书列表并统计数量

## 3. 后端 Service — 四层代理导入修复

- [x] 3.1 新增 `_parse_nodes()` 静态方法，同时处理 dict 和 array 两种 nodes 格式
- [x] 3.2 `convert_upstream()` 改用 `_parse_nodes()` 解析 nodes
- [x] 3.3 `convert_stream_proxy()` 普通类型分支改用 `_parse_nodes()` 解析 nodes
- [x] 3.4 `convert_stream_proxy()` 普通类型分支新增 `retries`/`retry_timeout` 字段
- [x] 3.5 `convert_stream_proxy()` 新增 DNS 类型分支：识别 `plugins.dns_upstream`，设置 `proxy_type="dns"`、`scheme="udp"`、`dns_config`
- [x] 3.6 DNS 分支合并 `plugins.log_process` 到 `dns_config` 中
- [x] 3.7 清理返回值中不再需要的 `timeout`/`keepalive_pool` 顶层字段

## 4. 前端 API 类型 — 补充 SSL 响应类型

- [x] 4.1 `TestConnectionResponse` 新增 `ssl_certificate_count`
- [x] 4.2 定义 `SslCertificatePreview` 接口
- [x] 4.3 `PreviewResponse` 新增 `ssl_certificates` 字段
- [x] 4.4 `ImportedCounts` 新增 `ssl_certificates` 字段

## 5. 前端 EdgeImport — 展示 SSL 信息

- [x] 5.1 测试连接结果展示中增加 SSL 证书计数
- [x] 5.2 预览步骤新增 SSL 证书区域卡片（含 select + 可展开详情表格）
- [x] 5.3 新增 `sslCertificateColumns` 列定义
- [x] 5.4 `expandedSections` 新增 `ssl_certificates` 控制
- [x] 5.5 `handleCancel` 补充重置 `stream_proxy` 和 `ssl_certificates` 选中状态
- [x] 5.6 导入结果弹窗新增 `SSL 证书` 计数行

## 6. 前端 EdgeClient — Tab 顺序调整 + 弹窗统一

- [x] 6.1 SSL 证书 tab 移到四层代理右侧
- [x] 6.2 SSL 查看弹窗从 `Modal.info()` 改为 jsonModal
- [x] 6.3 SSL 删除从 `a-popconfirm` 改为 `Modal.confirm`
- [x] 6.4 清理未使用的 `h` 和 `viewSslDetail` 函数

## 7. 测试用例

- [x] 7.1 `test_parse_nodes_dict` — dict 格式 nodes 解析
- [x] 7.2 `test_parse_nodes_array` — array 格式 nodes 解析
- [x] 7.3 `test_parse_nodes_array_no_port` — array 格式无 port
- [x] 7.4 `test_parse_nodes_empty` — 空/None 输入
- [x] 7.5 `test_convert_upstream_nodes_array_format` — upstream 数组格式
- [x] 7.6 `test_convert_upstream_nodes_empty_array` — upstream 空数组
- [x] 7.7 `test_convert_stream_proxy_nodes_array_format` — stream proxy 数组格式
- [x] 7.8 `test_convert_stream_proxy_retries` — retries/retry_timeout 字段
- [x] 7.9 `test_convert_stream_proxy_retries_missing` — retries 缺失场景
- [x] 7.10 `test_convert_stream_proxy_dns_type` — DNS 类型，验证 scheme=udp、无 log_process
- [x] 7.11 `test_convert_stream_proxy_dns_type_with_log` — DNS 类型含 log_process 合并
- [x] 7.12 `test_convert_stream_proxy_dns_type_no_targets` — DNS 类型忽略 upstream.nodes
