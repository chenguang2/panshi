## Purpose

支持在平台内直接生成国密 SM2 客户端双证书（签名+加密），用于国密 NTLS/TLCP 双向认证场景（ECDHE-SM2-* 套件强制要求客户端证书）。客户端证书由已有 CA 签发，作为证书生成流程的可选部分。

## Requirements

### Requirement: 生成客户端双证书

系统 SHALL 支持在生成服务端证书时同时生成客户端签名证书和加密证书，由指定的 CA 签发。

#### Scenario: 客户端证书生成触发

- **WHEN** 用户调用证书生成 API `POST /api/v1/clusters/{cluster_id}/ssl/generate`
- **AND** `algorithm=sm2`
- **AND** `generate_client_certs=true`
- **AND** `ca_cert_id=<id>`（引用已有 CA）
- **THEN** 系统 SHALL 在执行服务端证书生成后，额外执行以下步骤：
  - 生成客户端签名密钥对 + CSR → 由 CA 签发 → `client_sign.crt`
  - 生成客户端加密密钥对 + CSR → 由 CA 签发 → `client_enc.crt`

#### Scenario: 服务端+客户端之间无先后依赖

- **WHEN** 系统同时生成服务端和客户端证书
- **THEN** 服务端证书和客户端证书 SHALL 使用 **同一个 CA**（通过 `ca_cert_id` 指定）
- **AND** 服务端证书与客户端证书之间无依赖关系（并行生成或顺序生成均可）

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
- **AND** CN 固定为 `{common_name}-client`

#### Scenario: 客户端证书存储

- **WHEN** 客户端证书生成成功
- **THEN** 系统 SHALL 创建一条独立的 `SslCertificate` 记录
- **AND** `cert_type` 设为 `client`
- **AND** `cert` 存储客户端加密证书，`key` 存储加密私钥
- **AND** `sign_cert` 存储客户端签名证书，`sign_key` 存储签名私钥
- **AND** `gm` 设为 `true`
- **AND** `is_ca` 设为 `false`
- **AND** `ca_cert_id` 关联到签发 CA 的证书记录

### Requirement: 客户端证书使用

生成的客户端证书用于 `gmssl s_client` 等双向认证工具，**不发布到 Edge 节点**。

#### Scenario: 客户端证书禁止发布

- **WHEN** 用户查看客户端证书记录
- **THEN** 前端 SHALL 不显示"发布"按钮
- **WHEN** 用户直接调用发布 API
- **THEN** 后端 SHALL 返回 400，提示"客户端证书不需要发布到 Edge"

#### Scenario: 下载客户端证书包

- **WHEN** 用户查看客户端证书记录详情
- **THEN** 前端 SHALL 提供"下载客户端证书包"按钮
- **AND** 下载 ZIP 文件包含：
  - `client_sign.crt` — 客户端签名证书
  - `client_sign.key` — 客户端签名私钥
  - `client_enc.crt` — 客户端加密证书
  - `client_enc.key` — 客户端加密私钥
  - `ca.crt` — 签发 CA 的证书，用于 `-verifyCAfile`
