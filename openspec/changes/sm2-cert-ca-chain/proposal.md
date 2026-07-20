## Why

SM2 国密双证书当前生成方式为自签名（self-signed），缺少 CA 根证书体系。真实生产环境中 Edge 网关的国密 NTLS/TLCP 协议需要完整的证书链（Root CA → 终端证书）才能做信任验证，且 `ECDHE-SM2-*` 套件强制双向认证需要客户端证书。目前系统只能生成服务端自签名证书，无法满足实际部署和测试需求。

## What Changes

- `cert_generator.py`: 新增 CA 根证书生成函数、CA 签发函数；改造双证书生成函数，支持由 CA 签发替代自签名；支持远程模式下 CA 链生成
- `schemas/ssl.py`: `SslCertificateGenerateRequest` 新增 `generate_ca`、`generate_client_certs`、`ca_cert_id`、`validity_days_ca` 字段
- `models/ssl.py`: `SslCertificate` 模型新增 `is_ca`（Boolean）、`ca_cert_id`（FK）字段；CA 私钥默认不返回
- `cluster_ssl.py`: 本地和远程模式均支持完整链一次性生成（CA + 服务端双证 + 客户端双证）
- 前端 SSL 列表页增加 tab 切换（全部证书 / CA 根证书）
- 前端 SSL 生成对话框：新增 CA/客户端证书生成选项、已有 CA 选择下拉框
- 发布到 Edge 时通过 `ca_cert_id` 关联携带 CA 证书链
- 客户端证书前后端双重阻止发布操作

## Capabilities

### New Capabilities
- `sm2-ca-certificate-generation`: CA 根证书生成（SM2 密钥对 + 自签名 CA 证书，含 keyCertSign/cRLSign 等关键扩展）
- `sm2-client-certificate-generation`: 客户端签名/加密双证书生成（由指定 CA 签发）
- `sm2-certificate-download`: 生成后的 CA 证书、客户端证书前端下载能力

### Modified Capabilities
- `ssl-certificate-generation`: SM2 双证书生成从自签名模式升级为 CA 签发模式，支持证书链（CA → Server Sign → Server Enc）；支持一次性生成服务端+客户端全量证书

## Impact

- `backend/app/services/cert_generator.py` — 核心生成函数增强
- `backend/app/schemas/ssl.py` — 请求/响应 schema 扩展
- `backend/app/models/ssl.py` — 表结构新增字段
- `backend/app/api/v1/cluster_ssl.py` — 生成路由改造，返回 CA/客户端证书
- `frontend/src/components/SslFormDrawer.vue` — 生成对话框新增选项
- `frontend/src/types/ssl.ts` — TypeScript 类型同步
