## Why

SM2 国密双证书当前生成方式为自签名（self-signed），缺少 CA 根证书体系。真实生产环境中 Edge 网关的国密 NTLS/TLCP 协议需要完整的证书链（Root CA → 终端证书）才能做信任验证，且 `ECDHE-SM2-*` 套件强制双向认证需要客户端证书。目前系统只能生成服务端自签名证书，无法满足实际部署和测试需求。

## What Changes

### Core Certificate Generation (`cert_generator.py`)
- 新增 `get_cert_expiry()` — 证书有效期解析工具函数，用于有效期截断和发布时 CA 过期检测
- 新增 `generate_ca_certificate()` — CA 根证书生成（SM2 密钥对 + 自签名 CA 证书，含 keyCertSign/cRLSign 等关键扩展）
- 新增 `ca_sign_csr()` — CA 签发 CSR 函数，自动截断有效期不超过 CA
- 改造 `generate_dual_certificates()` — SM2 强制 CA 签发（移除自签名回退），新增 `ca_cert_pem`/`ca_key_pem` 必填参数
- SM2 强制双证书模式，移除单证书路径
- 移除远程生成相关代码

### Data Model (`models/ssl.py`)
- `SslCertificate` 新增 `is_ca`（Boolean）、`ca_cert_id`（FK）字段；CA 私钥默认不返回

### Schema (`schemas/ssl.py`)
- `CaCertificateGenerateRequest` — CA 创建专用请求体（name, common_name, validity_days）
- `SslCertificateGenerateRequest` — 简化：移除 `mode`、`node_id`、`generate_ca`、`validity_days_ca`；新增 `ca_cert_id`（SM2 必填）、`generate_client_certs`
- `SslCertificateGenerateResponse` — generate 端点响应结构，包含 `server`（SslCertificateResponse）和 `client`（SslCertificateResponse|null）两个子对象

### API Endpoints
- **新增** `POST /api/v1/clusters/{cluster_id}/ssl/ca` — CA 根证书独立端点
- **新增** `GET /api/v1/ssl/{id}/ca-key` — CA 私钥下载（需确认）
- **改造** `POST /api/v1/clusters/{cluster_id}/ssl/generate` — 简化，SM2 必须指定 `ca_cert_id`
- **移除** 远程生成模式所有相关代码

### Publish
- 发布国密证书时通过 `ca_cert_id` 关联携带 CA 证书链（`cert_chain` = sign_cert + ca_cert 拼接 PEM）
- 发布前通过 `get_cert_expiry()` 检查 CA 是否已过期，过期则 400 拒绝
- 客户端证书和 CA 证书前后端双重阻止发布操作

### Frontend
- 新增 CA 创建对话框
- SSL 列表页增加 tab 切换（全部证书 / CA 根证书）
- SSL 生成对话框简化：移除模式选择，新增 CA 选择下拉框（SM2 必填）、客户端证书选项
- 首次 SM2 流程引导：集群无 CA 时提示先创建 CA

## Capabilities

### New Capabilities
- `sm2-ca-certificate-generation`: CA 根证书生成（SM2 密钥对 + 自签名 CA 证书，独立 API 端点）
- `sm2-client-certificate-generation`: 客户端签名/加密双证书生成（由指定 CA 签发）
- `sm2-certificate-download`: 生成后的 CA 证书、客户端证书前端下载能力

### Modified Capabilities
- `ssl-certificate-generation`: SM2 双证书生成从自签名模式升级为 **强制 CA 签发模式**；不再支持远程生成

### Removed Capabilities
- `remote-certificate-generation`: 远程 SSH 证书生成模式已移除（CA 信任锚点中心化的需要）

## Impact

- `backend/app/services/cert_generator.py` — 核心生成函数增强
- `backend/app/schemas/ssl.py` — 请求/响应 schema 变更
- `backend/app/models/ssl.py` — 表结构新增字段
- `backend/app/api/v1/cluster_ssl.py` — 生成路由改造，移除远程模式
- `frontend/src/components/SslFormDrawer.vue` — 生成对话框简化
- `frontend/src/types/ssl.ts` — TypeScript 类型同步
