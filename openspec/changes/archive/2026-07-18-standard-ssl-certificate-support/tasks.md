## 1. Backend: 证书生成服务扩展

- [x] 1.1 `cert_generator.py`: 新增 `detect_cert_algorithm(cert_pem: str) -> str` 函数，通过 `openssl x509 -text` 解析 PEM 检测签名算法
- [x] 1.2 `cert_generator.py`: 新增 `generate_rsa_keypair()` 函数（`genrsa -out key 2048`）
- [x] 1.3 `cert_generator.py`: 新增 `generate_ecdsa_keypair()` 函数（`ecparam -genkey -name prime256v1`）
- [x] 1.4 `cert_generator.py`: 修改 `generate_openssl_cnf()` 增加 `hash_alg` 参数
- [x] 1.5 `cert_generator.py`: 修改 `generate_csr()` 和 `self_sign_certificate()` 增加 `hash_alg` 参数，Tongsuo flavor 时仅在 SM2 模式加 `-sigopt`
- [x] 1.6 `cert_generator.py`: 新增 `generate_standard_certificate()` 函数，封装 RSA/ECDSA 的单证书生成流程
- [x] 1.7 `cert_generator.py`: 修改 `detect_openssl()` 新增 `available` 通用可用性标记
- [x] 1.8 `cert_generator.py`: 扩展 `LocalProvider`，增加 `generate_certificate()` 方法支持 `algorithm` 参数

## 2. Backend: 数据模型和 Schema 扩展

- [x] 2.1 `models/ssl.py`: `SslCertificate` 增加 `algorithm = Column(String(16), nullable=True)` 字段
- [x] 2.2 `schemas/ssl.py`: `SslCertificateBase` 增加 `algorithm: Optional[str] = None`
- [x] 2.3 `schemas/ssl.py`: `SslCertificateGenerateRequest` 增加 `algorithm` 字段
- [x] 2.4 `schemas/ssl.py`: 非 SM2 模式 `dual_cert` 在 `_generate_local/_remote` 中被忽略
- [x] 2.5 `schemas/ssl.py`: `SslCertificateCreate` 中 `algorithm` 为空时自动触发 `detect_cert_algorithm()`
- [x] 2.6 `core/migrate.py`: 新增 `algorithm` 列 migration + `_backfill_cert_algorithm()` 存量回填

## 3. Backend: API 路由适配

- [x] 3.1 `cluster_ssl.py`: `_generate_local()` 使用 `provider.generate_certificate()`，根据 algorithm 设置 `gm`/`sign_cert`/`sign_key`
- [x] 3.2 `cluster_ssl.py`: `_generate_remote()` 根据 algorithm 执行不同命令（RSA 用 `genrsa`、ECDSA 用 `ecparam -genkey -name prime256v1`），不带 `-sm3`/`-sigopt`
- [x] 3.3 `cluster_ssl.py`: `create_ssl_certificate()` 中 algorithm 为空时由 schema auto-detect 处理
- [x] 3.4 `cluster_ssl.py`: 保存时根据 algorithm 正确设置 `gm`/`sign_cert`/`sign_key`

## 4. Backend: Edge 导入适配

- [x] 4.1 `edge_import_service.py`: 非 GM 证书调用 `detect_cert_algorithm()` 检测算法
- [x] 4.2 `edge_import_service.py`: GM 证书直接设 `algorithm=sm2`

## 5. Backend: 测试

- [x] 5.1 `test_cert_generator.py`: RSA 密钥生成测试（39 tests all pass）
- [x] 5.2 `test_cert_generator.py`: ECDSA 密钥生成测试
- [x] 5.3 `test_cert_generator.py`: RSA/ECDSA 自签名证书生成测试
- [x] 5.4 `test_cert_generator.py`: `detect_cert_algorithm()` 三种 PEM 检测测试
- [x] 5.5 `test_cert_generator.py`: `LocalProvider` 在 `algorithm=rsa`/`ecc` 模式下的集成测试
- [x] 5.6 `test_ssl.py`: `algorithm` 字段相关的 model 和 schema 测试
- [x] 5.7 后端全量测试通过（66 tests）

## 6. Frontend: 类型和 API 层更新

- [x] 6.1 `types/ssl.ts`: `SslCertificate` 接口增加 `algorithm?: string`
- [x] 6.2 `types/ssl.ts`: `SslCertificateGenerateRequest` 增加 `algorithm?: 'sm2' | 'rsa' | 'ecc'`
- [x] 6.3 `api/ssl.ts`: 确认函数透传 `algorithm` 字段（已验证）

## 7. Frontend: 生成弹窗改造

- [x] 7.1 `SslGenerateDialog.vue`: 标题改为"生成证书"，增加算法选择器
- [x] 7.2 `SslGenerateDialog.vue`: 非 SM2 算法隐藏"双证书"选项
- [x] 7.3 `SslGenerateDialog.vue`: 表单提交正确传递 `algorithm` 参数

## 8. Frontend: 列表和显示适配

- [x] 8.1 `SslList.vue`: 算法 badge（SM2 双证书 / SM2 单证书 / RSA 2048 / ECC P-256）
- [x] 8.2 `SslList.vue`: 生成成功提示根据算法动态显示
- [x] 8.3 `SslViewDrawer.vue`: `sign_cert`/`sign_key` 根据 `algorithm` 控制显示
- [x] 8.4 `SslCertDownloadDialog.vue`: 算法标签显示 + 条件下载项

## 9. 验证

- [x] 9.1 手动验证：SM2 证书生成功能与改动前完全一致（API 测试通过）
- [x] 9.2 手动验证：RSA 证书生成成功（API 测试通过）
- [x] 9.3 手动验证：ECDSA 证书生成成功（API 测试通过）
- [x] 9.4 手动验证：上传 RSA 证书，algorithm 自动检测为 `rsa`（API 测试通过）
- [x] 9.5 手动验证：Edge 导入非国密证书，确认 algorithm 回填正确（代码路径 + 远程生成 + 上传检测已验证，Edge 空 PEM 条目保持 null 为正确行为）
- [x] 9.6 `lsp_diagnostics` 无新增错误/警告
