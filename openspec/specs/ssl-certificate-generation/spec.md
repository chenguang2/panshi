## Purpose

支持在平台内直接生成 SM2 国密 SSL 证书（含双证书模式），无需通过外部工具手动生成后再上传。生成的证书自动保存为 SSL 证书记录，复用现有的发布、版本历史、回滚、配置比对等基础设施。

## Requirements

### Requirement: 生成 SM2 自签名证书

系统 SHALL 提供 API 端点为指定集群生成 SM2 国密自签名证书，支持本地和远程两种生成方式，支持单证书和双证书（加密+签名）模式。

#### Scenario: 生成本地单证书（简易模式）
- **WHEN** 用户调用生成 API，指定 `mode=local`、`dual_cert=false`
- **THEN** 系统 SHALL 检测本地可用 openssl（bundled Tongsuo 优先，其次系统 PATH）
- **AND** 执行以下步骤：生成 SM2 密钥对 → 生成 CSR → 自签名证书
- **AND** 返回的 `cert` 包含证书 PEM，`key` 包含私钥 PEM
- **AND** `gm` 设为 `true`，`sign_cert` 和 `sign_key` 为空
- **AND** `create_method` 设为 `local_generate`

#### Scenario: 生成本地双证书（国密标准模式）
- **WHEN** 用户调用生成 API，指定 `mode=local`、`dual_cert=true`
- **THEN** 系统 SHALL 执行以下步骤：
  - 生成加密密钥对 + CSR + 自签名证书 → `enc_cert` + `enc_key`
  - 生成签名密钥对 + CSR + 自签名证书 → `sign_cert` + `sign_key`
- **AND** 加密证书和签名证书共用同一组 CN、SAN 参数
- **AND** `cert` 包含加密证书 PEM，`key` 包含加密私钥 PEM
- **AND** `sign_cert` 包含签名证书 PEM，`sign_key` 包含签名私钥 PEM
- **AND** `gm` 设为 `true`
- **AND** `create_method` 设为 `local_generate`

#### Scenario: 远程生成双证书
- **WHEN** 用户调用生成 API，指定 `mode=remote`、`node_id=<id>`、`dual_cert=true`
- **THEN** 系统 SHALL 通过 SSH 连接到指定节点
- **AND** 在远程节点上执行 SM2 密钥对生成、CSR 签发、自签名证书签发
- **AND** 返回结果与本地双证书格式一致
- **AND** `create_method` 设为 `remote_generate`

#### Scenario: 参数验证
- **WHEN** 用户调用生成 API，不提供 `common_name`
- **THEN** 系统 SHALL 返回 422，提示"通用名称（CN）为必填"
- **WHEN** 用户指定 `mode=remote` 但不提供 `node_id`
- **THEN** 系统 SHALL 返回 422，提示"远程生成时必须指定节点"
- **WHEN** 用户指定 `mode=local` 且本地无可用的 openssl
- **THEN** 系统 SHALL 返回 400，提示"本地无可用的 SM2 生成环境"
- **WHEN** 用户指定 `mode=remote` 且指定节点 SSH 不可达
- **THEN** 系统 SHALL 返回 400，提示"指定节点不可达"

#### Scenario: 参数缺省值
- **WHEN** 用户不提供 `validity_days`
- **THEN** 系统 SHALL 使用默认值 365 天
- **WHEN** 用户不提供 `dual_cert`
- **THEN** 系统 SHALL 默认生成双证书（`dual_cert=true`）
- **WHEN** 用户不提供 `cert_type`
- **THEN** 系统 SHALL 默认使用 `server`

### Requirement: OpenSSL 版本和参数适配

系统 SHALL 根据 openssl 发行版类型自动适配命令行参数。

#### Scenario: bundled Tongsuo 加 sigopt
- **WHEN** 检测到 openssl 来源为 `backend/bin/openssl`（bundled Tongsuo）
- **AND** `openssl version` 输出含 "Tongsuo"
- **THEN** 所有签名操作 SHALL 添加 `-sigopt "sm2_id:1234567812345678"` 参数

#### Scenario: 系统 PATH 标准 OpenSSL 不加 sigopt
- **WHEN** 检测到 openssl 来源为系统 PATH
- **AND** `openssl version` 输出含 "OpenSSL" 但不含 "Tongsuo" 或 "BabaSSL"
- **THEN** 签名操作 SHALL 不加 `-sigopt` 参数

#### Scenario: 远程节点 Tongsuo 加 sigopt
- **WHEN** 远程节点 `openssl version` 输出含 "Tongsuo" 或 "BabaSSL"
- **THEN** 签名操作 SHALL 添加 `-sigopt "sm2_id:1234567812345678"` 参数

#### Scenario: 生成的证书签名算法
- **WHEN** 证书生成成功
- **THEN** 证书的 Signature Algorithm SHALL 为 `SM2-with-SM3`
- **AND** 公钥 ASN1 OID SHALL 为 `SM2`

### Requirement: 证书生成 API 端点

系统 SHALL 提供 REST API 端点用于生成国密证书。

#### Scenario: 生成端点
- **WHEN** 用户发送 POST 请求到 `/api/v1/clusters/{cluster_id}/ssl/generate`
- **AND** 请求体包含 `name`（必填）、`common_name`（必填）、`mode`（必填，local/remote）、`node_id`（remote 时必填）、`dns_sans`（可选数组）、`ip_sans`（可选数组）、`validity_days`（可选，默认 365）、`dual_cert`（可选 bool，默认 true）、`cert_type`（可选，默认 server）
- **THEN** 系统 SHALL 返回 HTTP 201
- **AND** 响应体为 `SslCertificateResponse` JSON（含 `create_method` 字段）
- **WHEN** `cluster_id` 不存在
- **THEN** 系统 SHALL 返回 HTTP 404
- **WHEN** 指定 `mode=remote` 且 `node_id` 不属于该集群
- **THEN** 系统 SHALL 返回 HTTP 400

### Requirement: 域名和 IP 的 SAN 处理

系统 SHALL 在生成 CSR 时自动区分域名 SAN 和 IP SAN 的格式。

#### Scenario: DNS SAN 格式化
- **WHEN** 用户传入 `dns_sans: ["example.com", "www.example.com"]`
- **THEN** CSR 的 subjectAltName 扩展 SHALL 包含 `DNS:example.com,DNS:www.example.com`

#### Scenario: IP SAN 格式化
- **WHEN** 用户传入 `ip_sans: ["10.0.0.1", "192.168.1.1"]`
- **THEN** CSR 的 subjectAltName 扩展 SHALL 包含 `IP:10.0.0.1,IP:192.168.1.1`

#### Scenario: 域名和 IP 合并
- **WHEN** 用户同时传入 `dns_sans` 和 `ip_sans`
- **THEN** subjectAltName 扩展 SHALL 包含所有域名和 IP，使用正确的 `DNS:` / `IP:` 前缀
- **AND** 格式为 `DNS:example.com,IP:10.0.0.1,DNS:www.example.com`
