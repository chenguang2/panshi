## Why

平台已支持生成国密 SM2 证书，但 Chrome、Firefox、Safari 等国际主流浏览器不支持国密协议。当用户使用这些浏览器访问 Edge 网关时，必须部署标准 OpenSSL 证书（RSA/ECDSA）。目前平台缺少标准证书的生成能力，用户需手动用外部工具生成后再上传。

## What Changes

- **新增标准证书（RSA/ECDSA）生成能力**：在证书生成流程中增加算法选项，支持 RSA 2048-bit 和 ECDSA P-256 标准证书的自签名生成
- **前端生成弹窗增加算法选择**：将"生成国密证书"泛化为"生成证书"，增加 SM2 / RSA / ECC 三种算法选择
- **API 扩展**：`SslCertificateGenerateRequest` 增加 `algorithm` 字段，非 SM2 模式固定为单证书
- **发布流程保持兼容**：非国密证书发布时标记 `gm=false`，Edge 端按标准 TLS 处理
- **Tongsuo 复用**：标准证书复用同一 bundld Tongsuo 二进制，无需额外 OpenSSL 依赖

## Capabilities

### New Capabilities
- `standard-cert-generation`: 支持 RSA 和 ECDSA 标准证书的本地/远程自签名生成，含密钥生成、CSR 签发、自签名全流程

### Modified Capabilities
- `ssl-certificate-generation`: 现有 SM2 证书生成能力不变，增加算法选择参数；非 SM2 模式下固定为单证书而非双证书

## Impact

- `backend/app/services/cert_generator.py`: 增加 RSA/ECDSA 密钥生成、CSR、自签名路径（共用现有 LocalProvider 架构）
- `backend/app/schemas/ssl.py`: `SslCertificateGenerateRequest` 增加 `algorithm` 字段
- `backend/app/api/v1/cluster_ssl.py`: 生成路由根据 `algorithm` 分发到不同生成逻辑
- `frontend/src/components/SslGenerateDialog.vue`: 算法选择器、条件显示双证书选项
- `frontend/src/types/ssl.ts`: `algorithm` 字段
- `backend/bin/openssl`（bundled Tongsuo）：Tongsuo 已内含 RSA/ECDSA 支持，无需额外二进制
