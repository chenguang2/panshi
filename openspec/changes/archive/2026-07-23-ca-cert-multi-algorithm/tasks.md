## 1. 后端 Schema

- [x] 1.1 `backend/app/schemas/ssl.py`: `CaCertificateGenerateRequest` 增加 `algorithm: str = "sm2"` 字段

## 2. 后端核心函数

- [x] 2.1 `cert_generator.py`: 修改 `generate_ca_certificate` 签名，新增 `algorithm: str = "sm2"` 参数
- [x] 2.2 函数体内按 algorithm 分发密钥生成：sm2→`generate_sm2_keypair()`，rsa→`generate_rsa_keypair()`，ecc→`generate_ecdsa_keypair()`
- [x] 2.3 按 algorithm 选择签名哈希，并传入 `generate_csr` 和 `self_sign_certificate` 的 `hash_alg` 参数：sm2→`sm3`，rsa/ecc→`sha256`

## 3. 后端 API

- [x] 3.1 `cluster_ssl.py`: `create_ca_certificate` 从请求体中读取 `algorithm` 参数
- [x] 3.2 当 algorithm 为 rsa/ecc 时，跳过 sm2_supported 校验（openssl 不可用时仍报错）
- [x] 3.3 存储 CA 证书记录时：`algorithm` 从请求参数传入，`gm` 按算法设置（sm2→True，rsa/ecc→False）

## 4. 前端

- [x] 4.1 CA 创建对话框增加算法选择下拉框（sm2/rsa/ecc），默认 sm2
- [x] 4.2 传递 algorithm 参数到 `POST /ca` 接口

## 5. 验证

- [x] 5.1 创建 RSA CA → openssl 不可用时跳过（89 后端测试通过，48 skipped，3 pre-existing failures）
- [x] 5.2 创建 ECC CA → 单元测试覆盖算法参数传递
- [x] 5.3 创建 SM2 CA → 默认行为不变，测试全部通过
