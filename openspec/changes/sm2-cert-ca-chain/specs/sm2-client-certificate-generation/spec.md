## Purpose

支持在平台内直接生成国密 SM2 客户端双证书（签名+加密），用于国密 NTLS/TLCP 双向认证场景（ECDHE-SM2-* 套件强制要求客户端证书）。

## Requirements

### Requirement: 生成客户端双证书

系统 SHALL 支持为客户端生成签名证书和加密证书，由已有的 CA 签发。

#### Scenario: 客户端证书生成触发

- **WHEN** 用户指定 `generate_client_certs=true`
- **AND** `generate_ca=true`（CA 同时生成）
- **OR** `ca_cert_id=<id>`（引用已有 CA）
- **THEN** 系统 SHALL 执行以下步骤：
  - 生成客户端签名密钥对 + CSR → 由 CA 签发 → `client_sign.crt`
  - 生成客户端加密密钥对 + CSR → 由 CA 签发 → `client_enc.crt`

#### Scenario: 客户端证书扩展

- **WHEN** 系统生成客户端签名证书
- **THEN** 证书 SHALL 包含以下扩展：
  - `basicConstraints = CA:FALSE`
  - `keyUsage = critical, digitalSignature, nonRepudiation`
- **WHEN** 系统生成客户端加密证书
- **THEN** 证书 SHALL 包含以下扩展：
  - `basicConstraints = CA:FALSE`
  - `keyUsage = critical, keyEncipherment, dataEncipherment`

#### Scenario: 客户端证书 CN

- **WHEN** 生成客户端证书
- **THEN** 签名证书和加密证书的 Subject SHALL 共享同一个 CN
- **AND** 默认 CN 为 `{common_name}-client`，用户可自定义
- **AND** 如果用户传入了 `dns_sans`/`ip_sans`，SHALL 正常附加 SAN 扩展
- **AND** 如果用户未传入 SAN 参数，SHALL 不附加 SAN 扩展

#### Scenario: 客户端证书存储

- **WHEN** 客户端证书生成成功
- **THEN** 系统 SHALL 创建一条 `SslCertificate` 记录
- **AND** `cert_type` 设为 `client`
- **AND** `cert` 存储客户端加密证书，`key` 存储加密私钥
- **AND** `sign_cert` 存储客户端签名证书，`sign_key` 存储签名私钥
- **AND** `gm` 设为 `true`
- **AND** `ca_cert` 存储签发 CA 的证书 PEM
- **AND** 通过 `ca_cert_id` 关联到 CA 证书记录

### Requirement: 客户端证书使用

生成的客户端证书用于 `gmssl s_client` 等双向认证工具，**不发布到 Edge 节点**。

#### Scenario: 客户端证书禁止发布

- **WHEN** 用户查看客户端证书记录
- **THEN** 前端 SHALL 不显示"发布"按钮
- **WHEN** 用户直接调用发布 API
- **THEN** 后端 SHALL 返回 400，提示"客户端证书不需要发布到 Edge"

#### Scenario: 下载客户端证书

- **WHEN** 用户查看客户端证书记录详情
- **THEN** 前端 SHALL 提供下载按钮
- **AND** 下载文件包含：`client_sign.crt` + `client_sign.key` + `client_enc.crt` + `client_enc.key`
- **AND** 同时提供 CA 证书（`gm_ca.crt`）下载，用于 `-verifyCAfile`
