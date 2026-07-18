## MODIFIED Requirements

### Requirement: 生成 SM2 自签名证书

系统 SHALL 提供 API 端点为指定集群生成 SM2 国密自签名证书，支持本地和远程两种生成方式，支持单证书和双证书（加密+签名）模式。

#### Scenario: 生成本地单证书（简易模式）
- **WHEN** 用户调用生成 API，指定 `algorithm=sm2`、`mode=local`、`dual_cert=false`
- **THEN** 系统 SHALL 检测本地可用 openssl（bundled Tongsuo 优先，其次系统 PATH），确认 SM2 曲线可用
- **AND** 执行以下步骤：生成 SM2 密钥对 → 生成 CSR（SM3 摘要）→ 自签名证书（SM3 摘要）
- **AND** 返回的 `cert` 包含证书 PEM，`key` 包含私钥 PEM
- **AND** `gm` 设为 `true`，`sign_cert` 和 `sign_key` 为空
- **AND** `algorithm` 设为 `sm2`
- **AND** `create_method` 设为 `local_generate`

#### Scenario: 生成本地双证书（国密标准模式）
- **WHEN** 用户调用生成 API，指定 `algorithm=sm2`、`mode=local`、`dual_cert=true`
- **THEN** 系统 SHALL 执行以下步骤：
  - 生成加密密钥对 + CSR（SM3 摘要） + 自签名证书 → `enc_cert` + `enc_key`
  - 生成签名密钥对 + CSR（SM3 摘要） + 自签名证书 → `sign_cert` + `sign_key`
- **AND** 加密证书和签名证书共用同一组 CN、SAN 参数
- **AND** `cert` 包含加密证书 PEM，`key` 包含加密私钥 PEM
- **AND** `sign_cert` 包含签名证书 PEM，`sign_key` 包含签名私钥 PEM
- **AND** `gm` 设为 `true`
- **AND** `algorithm` 设为 `sm2`
- **AND** `create_method` 设为 `local_generate`

#### Scenario: 远程生成双证书
- **WHEN** 用户调用生成 API，指定 `algorithm=sm2`、`mode=remote`、`node_id=<id>`、`dual_cert=true`
- **THEN** 系统 SHALL 通过 SSH 连接到指定节点
- **AND** 在远程节点上执行 SM2 密钥对生成、CSR 签发、自签名证书签发
- **AND** 返回结果与本地双证书格式一致
- **AND** `create_method` 设为 `remote_generate`

#### Scenario: 参数验证
- **WHEN** 用户调用生成 API，不提供 `common_name`
- **THEN** 系统 SHALL 返回 422，提示"通用名称（CN）为必填"
- **WHEN** 用户指定 `mode=remote` 但不提供 `node_id`
- **THEN** 系统 SHALL 返回 422，提示"远程生成时必须指定节点"
- **WHEN** 用户指定 `algorithm=sm2`、`mode=local` 且本地 openssl 不支持 SM2 曲线
- **THEN** 系统 SHALL 返回 400，提示"本地 openssl 不支持 SM2 曲线"
- **WHEN** 用户指定 `algorithm=rsa` 或 `ecc`、`mode=local` 且本地无可用 openssl
- **THEN** 系统 SHALL 返回 400，提示"本地无可用 openssl"
- **WHEN** 用户指定 `mode=remote` 且指定节点 SSH 不可达
- **THEN** 系统 SHALL 返回 400，提示"指定节点不可达"

#### Scenario: 参数缺省值
- **WHEN** 用户不提供 `validity_days`
- **THEN** 系统 SHALL 使用默认值 365 天
- **WHEN** 用户不提供 `dual_cert`
- **THEN** 系统 SHALL 默认生成双证书（`dual_cert=true`）
- **WHEN** 用户不提供 `cert_type`
- **THEN** 系统 SHALL 默认使用 `server`
- **WHEN** 用户不提供 `algorithm`
- **THEN** 系统 SHALL 默认使用 `sm2`（向后兼容）

### Requirement: 证书生成 API 端点

系统 SHALL 提供 REST API 端点用于生成证书，支持 SM2、RSA、ECDSA 三种算法。

#### Scenario: 生成端点
- **WHEN** 用户发送 POST 请求到 `/api/v1/clusters/{cluster_id}/ssl/generate`
- **AND** 请求体包含 `name`（必填）、`common_name`（必填）、`mode`（必填，local/remote）、`algorithm`（可选，默认 sm2）、`node_id`（remote 时必填）、`dns_sans`（可选数组）、`ip_sans`（可选数组）、`validity_days`（可选，默认 365）、`dual_cert`（可选 bool，默认 true，仅 SM2 模式有效）、`cert_type`（可选，默认 server）
- **THEN** 系统 SHALL 返回 HTTP 201
- **AND** 响应体为 `SslCertificateResponse` JSON（含 `create_method` 和 `algorithm` 字段）
- **WHEN** `cluster_id` 不存在
- **THEN** 系统 SHALL 返回 HTTP 404
- **WHEN** 指定 `mode=remote` 且 `node_id` 不属于该集群
- **THEN** 系统 SHALL 返回 HTTP 400
- **WHEN** 传入 `algorithm` 值为 `sm2`、`rsa`、`ecc` 之外的字符串
- **THEN** 系统 SHALL 返回 HTTP 422

## ADDED Requirements

### Requirement: 生成 API 根据 algorithm 分发

系统 SHALL 在 `_generate_local()` 和 `_generate_remote()` 中根据 `algorithm` 参数执行不同逻辑。

#### Scenario: 本地生成非 SM2 不要求 SM2 曲线
- **WHEN** 用户指定 `algorithm=rsa` 或 `algorithm=ecc`、`mode=local`
- **THEN** 系统 SHALL 不检查 `sm2_supported` 标记
- **AND** 仅要求 openssl 二进制可用（`available=true`）

#### Scenario: 本地保存时正确设置国密标记
- **WHEN** 用户指定 `algorithm=rsa` 或 `algorithm=ecc`、`mode=local`
- **THEN** 保存的证书记录 SHALL `gm=false`、`sign_cert=null`、`sign_key=null`
- **WHEN** 用户指定 `algorithm=sm2`、`dual_cert=true`
- **THEN** 保存的证书记录 SHALL `gm=true`、`sign_cert` 和 `sign_key` 有值
- **WHEN** 用户指定 `algorithm=sm2`、`dual_cert=false`
- **THEN** 保存的证书记录 SHALL `gm=true`、`sign_cert=null`、`sign_key=null`

### Requirement: 共用函数支持多算法

`generate_openssl_cnf()`、`generate_csr()`、`self_sign_certificate()` SHALL 接受 `hash_alg` 参数以避免硬编码国密算法。

#### Scenario: 不同算法使用不同摘要
- **WHEN** `algorithm=rsa` 或 `algorithm=ecc`
- **THEN** CSR 生成和证书签名 SHALL 使用 SHA-256 摘要（`-sha256`）
- **AND** openssl.cnf 的 `default_md` 设为 `sha256`
- **AND** 不传递 `-sigopt` 参数
- **WHEN** `algorithm=sm2`
- **THEN** CSR 生成和证书签名 SHALL 使用 SM3 摘要（`-sm3`）
- **AND** Tongsuo flavor 时传递 `-sigopt sm2_id:1234567812345678`

### Requirement: 远程生成按算法分派

远程生成（_remote_generate_single / _remote_generate_dual）SHALL 根据 `algorithm` 使用不同的 openssl 命令模板。

#### Scenario: 远程生成 RSA 证书
- **WHEN** `algorithm=rsa`、`mode=remote`
- **THEN** 远程脚本 SHALL 使用 `genrsa -out key 2048` 生成密钥
- **AND** 使用 `req -new -sha256` 生成 CSR
- **AND** 使用 `x509 -req -sha256` 自签名
- **AND** 不带 `-sm3` 和 `-sigopt` 参数

#### Scenario: 远程生成 ECDSA 证书
- **WHEN** `algorithm=ecc`、`mode=remote`
- **THEN** 远程脚本 SHALL 使用 `ecparam -genkey -name prime256v1` 生成密钥
- **AND** 使用 SHA-256 摘要

### Requirement: 上传时自动检测算法

系统 SHALL 在创建 SSL 证书时自动检测算法。

#### Scenario: 创建端点自动检测
- **WHEN** 用户发送 POST 到 `/api/v1/clusters/{cluster_id}/ssl` 且 `algorithm` 为空
- **THEN** 系统 SHALL 调用 `detect_cert_algorithm()` 从 `cert` PEM 解析算法
- **AND** 检测结果写入 `algorithm` 字段
- **WHEN** `algorithm` 已指定
- **THEN** 跳过自动检测，以用户指定值为准
