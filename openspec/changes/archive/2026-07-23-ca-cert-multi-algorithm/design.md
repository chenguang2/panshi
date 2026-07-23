## Context

当前 `cert_generator.py` 中 `generate_ca_certificate` 只支持 SM2 算法：
- 密钥生成：硬编码 `generate_sm2_keypair()`
- 签名哈希：硬编码 `sm3`

而同一文件中已有完整的 RSA/ECC 支持基础设施：
- `generate_rsa_keypair()` / `generate_ecdsa_keypair()` — 密钥生成
- `generate_standard_certificate()` — 标准证书签发（RSA/ECC + SHA256）
- `self_sign_certificate()` — 自签名
- `generate_csr()` — CSR 生成（支持 `hash_alg` 参数）

前端 `SslGenerateDialog.vue` 的证书生成已支持算法选择（SM2/RSA/ECC），但 CA 创建流程中没有算法选择。

## Goals / Non-Goals

**Goals:**
- `generate_ca_certificate` 支持 `algorithm` 参数（sm2/rsa/ecc）
- API `POST /ca` 接收算法参数并透传
- `CaCertificateGenerateRequest` schema 增加可选 `algorithm` 字段
- CA 生成时不强制校验 `sm2_supported`（RSA/ECC 不需要 SM2 曲线）
- 可以生成 RSA/ECC 算法的 CA 根证书，用于签发对应算法的服务器证书

**Non-Goals:**
- 不改动已有的 SM2 CA 行为（默认仍为 sm2）
- 不需要新增外部依赖
- 不涉及证书链验证逻辑

## Decisions

### 1. 算法分发策略
直接在 `generate_ca_certificate` 内部用 if/else 分发，与 `LocalProvider.generate_certificate` 的模式一致。

```
algorithm == "sm2" → generate_sm2_keypair() + hash=sm3
algorithm == "rsa" → generate_rsa_keypair() + hash=sha256
algorithm == "ecc" → generate_ecdsa_keypair() + hash=sha256
```

CSR 生成和自签名时传入对应的 `hash_alg`（当前 `generate_csr` 和 `self_sign_certificate` 默认是 sm3，需要显式传 sha256）。

CA 扩展字段（basicConstraints=CA:true、keyUsage）所有算法通用，无需按算法区分。

### 2. API 层的 SM2 校验调整
当前 `create_ca_certificate` 在调用生成前检查 `sm2_supported`，对 RSA/ECC 不适用。改为：仅在 `algorithm == "sm2"` 时校验 SM2 支持。`openssl` 本身不可用（path 为空）时所有算法都应报错。

### 3. schema 设计
`CaCertificateGenerateRequest` 新增可选字段 `algorithm: str = "sm2"`，默认 sm2 保持向后兼容。

### 4. API 存储层字段
创建 CA 证书记录时：
- `algorithm`：从请求参数动态传入（不再硬编码 `"sm2"`）
- `gm`：RSA/ECC 时为 `False`，SM2 时为 `True`

### 5. 前端 CA 创建对话框
- 算法选择器放在「所属集群」选择框上方
- 下拉选项：SM2 / RSA / ECC，默认 SM2
- API payload 增加 `algorithm` 字段

## Risks / Trade-offs

- **[CA 用途限制]** RSA/ECC 的 CA 根证书目前仅用于自签发场景（`self_sign_certificate`），不支持 SM2 的双证书（加密+签名）模式。这在 RSA/ECC 场景下是合理的——RSA/ECC 标准证书是单证书。
- **[前端改动]** 需要为 CA 创建对话框增加算法选择器。可复用 `SslGenerateDialog.vue` 中已有的算法选择器组件/样式。
