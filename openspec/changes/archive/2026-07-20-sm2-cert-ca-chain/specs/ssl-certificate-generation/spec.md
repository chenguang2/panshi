## MODIFIED Requirements

### Requirement: 生成 SM2 证书

系统 SHALL 提供 API 端点为指定集群生成 SM2 国密证书。SM2 **强制双证书模式**（加密+签名），不再支持单证书。SM2 证书必须由 CA 签发，不再支持自签名。

#### Scenario: 生成本地双证书（国密标准模式）【改造：CA 签发】

- **WHEN** 用户调用生成 API，指定 `algorithm=sm2`
- **AND** `dual_cert` 参数被忽略，SM2 始终按双证书生成
- **AND** 指定 `ca_cert_id`（引用已有 CA 根证书）
- **THEN** 系统 SHALL 检测本地可用 openssl（bundled Tongsuo 优先，其次系统 PATH），确认 SM2 曲线可用
- **AND** 使用 CA 签发替代自签名，执行以下步骤：
  - 生成加密密钥对 + CSR（SM3 摘要）→ CA 签发 → 加密证书
  - 生成签名密钥对 + CSR（SM3 摘要）→ CA 签发 → 签名证书
- **AND** 加密证书和签名证书共用同一组 CN、SAN 参数
- **AND** 签名证书 SHALL 包含扩展：`keyUsage = digitalSignature, nonRepudiation`
- **AND** 加密证书 SHALL 包含扩展：`keyUsage = keyEncipherment, dataEncipherment`
- **AND** 终端证书有效期自动截断，不超过 CA 剩余有效期
- **AND** `cert` 包含加密证书 PEM，`key` 包含加密私钥 PEM
- **AND** `sign_cert` 包含签名证书 PEM，`sign_key` 包含签名私钥 PEM
- **AND** `gm` 设为 `true`，`algorithm` 设为 `sm2`
- **AND** `create_method` 设为 `local_generate`

#### Scenario: CA 必填验证

- **WHEN** 用户调用生成 API，指定 `algorithm=sm2`
- **AND** `ca_cert_id` 为空
- **THEN** 系统 SHALL 返回 400，提示"SM2 证书生成必须指定 CA 根证书"
- **WHEN** 用户指定 `ca_cert_id`
- **AND** 对应记录 `is_ca` 不为 `true`
- **THEN** 系统 SHALL 返回 400，提示"指定的 CA 证书无效"
- **WHEN** 用户指定 `ca_cert_id`
- **AND** 对应 CA 记录属于不同集群
- **THEN** 系统 SHALL 返回 400，提示"CA 证书不属于该集群"

#### Scenario: SM2 强制双证书模式

- **WHEN** 用户调用生成 API，指定 `algorithm=sm2`
- **THEN** 系统 SHALL **忽略** `dual_cert` 参数，始终按双证书模式生成（加密+签名）
- **AND** SM2 单证书模式不再支持

#### Scenario: 一次性生成服务端+客户端证书

- **WHEN** 用户调用生成 API，指定 `generate_client_certs=true`
- **AND** `algorithm=sm2`，`ca_cert_id` 有值
- **THEN** 系统 SHALL 一次性生成：
  - 服务端签名证书（由 CA 签发）
  - 服务端加密证书（由 CA 签发）
  - 客户端签名证书（由 CA 签发，存入独立 `SslCertificate` 记录，`cert_type=client`）
  - 客户端加密证书（由 CA 签发，存入同一客户端记录）

#### Scenario: 参数验证精简

- **WHEN** 用户调用生成 API，不提供 `common_name`
- **THEN** 系统 SHALL 返回 422，提示"通用名称（CN）为必填"
- **WHEN** 用户指定 `algorithm=sm2` 且本地 openssl 不支持 SM2 曲线
- **THEN** 系统 SHALL 返回 400，提示"本地 openssl 不支持 SM2 曲线"
- **WHEN** 用户指定 `algorithm=rsa` 或 `ecc` 且本地无可用 openssl
- **THEN** 系统 SHALL 返回 400，提示"本地无可用 openssl"

#### Scenario: 参数缺省值

- **WHEN** 用户不提供 `validity_days`
- **THEN** 系统 SHALL 使用默认值 365 天
- **WHEN** 用户不提供 `dual_cert`
- **THEN** 系统 SHALL 默认生成双证书（`dual_cert=true`）
- **AND** 对于 SM2，`dual_cert` 参数被忽略，始终强制双证书模式
- **WHEN** 用户不提供 `cert_type`
- **THEN** 系统 SHALL 默认使用 `server`
- **WHEN** 用户不提供 `algorithm`
- **THEN** 系统 SHALL 默认使用 `sm2`

#### Scenario: 有效期约束

- **WHEN** `validity_days` 大于 CA 证书的剩余有效期
- **THEN** 终端证书的实际有效期 SHALL 自动截断为 `min(validity_days, CA 有效期)`
- **AND** 系统 SHALL 在生成日志中记录截断说明

### Requirement: OpenSSL 版本和参数适配

系统 SHALL 根据 openssl 发行版类型和算法类型自动适配命令行参数。

*(此部分与原有 spec 一致，仅移除远程相关场景)*

#### Scenario: bundled Tongsuo + SM2 加 sigopt
- **WHEN** 检测到 openssl 来源为 `backend/bin/openssl`（bundled Tongsuo）
- **AND** `openssl version` 输出含 "Tongsuo"
- **AND** 当前算法为 SM2（`hash_alg=sm3`）
- **THEN** 签名操作 SHALL 添加 `-sigopt "sm2_id:1234567812345678"` 参数

#### Scenario: 标准算法不传递 sigopt
- **WHEN** 当前算法为 RSA 或 ECDSA（`hash_alg=sha256`）
- **THEN** 签名操作 SHALL 不添加 `-sigopt` 参数
- **AND** CSR 和签名操作 SHALL 使用 `-sha256` 而非 `-sm3`

#### Scenario: 生成的证书签名算法
- **WHEN** 生成 SM2 证书成功
- **THEN** 证书的 Signature Algorithm SHALL 为 `SM2-with-SM3`
- **AND** 公钥 ASN1 OID SHALL 为 `SM2`
- **WHEN** 生成 RSA 证书成功
- **THEN** 证书的 Signature Algorithm SHALL 为 `sha256WithRSAEncryption`
- **AND** 公钥算法 SHALL 为 `RSA (2048 bits)`
- **WHEN** 生成 ECDSA 证书成功
- **THEN** 证书的 Signature Algorithm SHALL 为 `ecdsa-with-SHA256`
- **AND** 公钥曲线 SHALL 为 `prime256v1 (P-256)`

### Requirement: 证书生成 API 端点

系统 SHALL 提供 REST API 端点用于生成证书，支持 SM2、RSA、ECDSA 三种算法。生成过程中执行的所有 openssl 命令 SHALL 被记录并返回。

#### Scenario: 生成端点参数

- **WHEN** 用户发送 POST 请求到 `/api/v1/clusters/{cluster_id}/ssl/generate`
- **AND** 请求体包含：
  - `name`（必填）
  - `common_name`（必填）
  - `algorithm`（可选，默认 sm2）
  - `ca_cert_id`（SM2 时必填，RSA/ECC 忽略）
  - `generate_client_certs`（可选 bool，默认 false，仅 SM2 有效）
  - `dns_sans`（可选数组）
  - `ip_sans`（可选数组）
  - `validity_days`（可选，默认 365）
  - `dual_cert`（可选 bool，默认 true，仅 RSA/ECC 有效，SM2 忽略此参数始终生成双证书）
  - `cert_type`（可选，默认 server）
- **THEN** 系统 SHALL 返回 HTTP 201
- **AND** 响应体为 `SslCertificateGenerateResponse` JSON，结构为：
  - `server`: `SslCertificateResponse` — 服务端证书记录（始终有值）
  - `client`: `SslCertificateResponse | null` — 客户端证书记录（`generate_client_certs=false` 时为 `null`）
- **AND** `create_method` 设为 `local_generate`

#### Scenario: 本地生成记录每个 openssl 命令
- **WHEN** 系统执行本地 openssl 命令生成证书
- **THEN** `generate_log` SHALL 包含每个 `_run_openssl()` 调用的记录
- **AND** 探测阶段的命令（如 `openssl version`、`openssl ecparam -list_curves`）SHALL 也计入 `generate_log`

### Requirement: 生成 API 根据 algorithm 分发

系统 SHALL 在 `_generate_local()` 中根据 `algorithm` 参数执行不同逻辑。

#### Scenario: 本地生成非 SM2 不要求 SM2 曲线
- **WHEN** 用户指定 `algorithm=rsa` 或 `algorithm=ecc`
- **THEN** 系统 SHALL 不检查 `sm2_supported` 标记
- **AND** 仅要求 openssl 二进制可用（`available=true`）

#### Scenario: 本地保存时正确设置国密标记
- **WHEN** 用户指定 `algorithm=rsa` 或 `algorithm=ecc`
- **THEN** 保存的证书记录 SHALL `gm=false`、`sign_cert=null`、`sign_key=null`
- **WHEN** 用户指定 `algorithm=sm2`
- **THEN** 保存的证书记录 SHALL `gm=true`、`sign_cert` 和 `sign_key` 有值（SM2 始终是双证书）

### Requirement: 证书发布时携带 CA 链

系统 SHALL 在发布国密双证书到 Edge 时，携带 CA 根证书作为证书链。CA 证书内容通过 `ca_cert_id` JOIN 获取，不冗余存储。

#### Scenario: 发布国密证书携带 CA 链

- **WHEN** 用户发布一个 `gm=true` 且 `ca_cert_id` 有值的 SSL 证书
- **THEN** 系统 SHALL 通过 `ca_cert_id` 查询 CA 记录的 `cert` 字段
- **AND** 系统 SHALL 检查 CA 证书的 `notAfter`，如果已过期则返回 400，提示"签发该证书的 CA 已过期"
- **AND** Edge API 请求体 SHALL 额外包含 `cert_chain` 字段
- **AND** `cert_chain` 内容为 `sign_cert + CA 证书 cert` 拼接的 PEM
- **AND** 不影响已有发布流程

### Requirement: CA 和客户端证书不发布

#### Scenario: 客户端证书拒绝发布
- **WHEN** 用户试图发布一个 `cert_type=client` 的 SSL 证书
- **THEN** 前端 SHALL 不显示"发布"按钮
- **AND** API 层面 SHALL 返回 400，提示"客户端证书不需要发布到 Edge 节点"

#### Scenario: CA 证书拒绝发布
- **WHEN** 用户试图发布一个 `is_ca=true` 的 SSL 证书
- **THEN** 前端 SHALL 不显示"发布"按钮
- **AND** API 层面 SHALL 返回 400，提示"CA 证书不需要发布到 Edge 节点"
