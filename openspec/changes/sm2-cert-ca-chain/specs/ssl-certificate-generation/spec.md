## MODIFIED Requirements

### Requirement: 生成 SM2 自签名证书

系统 SHALL 提供 API 端点为指定集群生成 SM2 国密证书，支持本地和远程两种生成方式，支持单证书和双证书（加密+签名）模式。

#### Scenario: 生成本地双证书（国密标准模式）【增强：CA 签发】

- **WHEN** 用户调用生成 API，指定 `algorithm=sm2`、`mode=local`、`dual_cert=true`
- **AND** 不指定任何 CA 参数（`generate_ca=false`，`ca_cert_id` 为空）
- **THEN** 系统 SHALL 保持原有自签名行为不变（向后兼容）

- **WHEN** 用户调用生成 API，指定 `algorithm=sm2`、`mode=local`、`dual_cert=true`
- **AND** 指定 `generate_ca=true`
- **THEN** 系统 SHALL 先生成 CA 根证书，再使用 CA 签发服务端签名证书和加密证书
- **AND** 加密证书和签名证书共用同一组 CN、SAN 参数
- **AND** 签名证书 SHALL 包含扩展：`keyUsage = digitalSignature, nonRepudiation`
- **AND** 加密证书 SHALL 包含扩展：`keyUsage = keyEncipherment, dataEncipherment`

- **WHEN** 用户调用生成 API，指定 `generate_ca=true`、`generate_client_certs=true`
- **THEN** 系统 SHALL 一次性生成：
  - CA 根证书（自签名）
  - 服务端签名证书（由 CA 签发）
  - 服务端加密证书（由 CA 签发）
  - 客户端签名证书（由 CA 签发）
  - 客户端加密证书（由 CA 签发）

#### Scenario: 参数增强

- **WHEN** 用户调用生成 API
- **AND** 指定 `generate_ca=true`
- **THEN** CA 有效期 SHALL 默认 3650 天，可通过 `validity_days_ca` 参数覆盖
- **AND** 终端证书有效期保持 `validity_days`（默认 365 天）

- **WHEN** 用户指定 `generate_ca=true` 且不提供 `ca_common_name`
- **THEN** 系统 SHALL 使用 `{common_name} CA` 作为 CA 证书的 CN

#### Scenario: 有效期约束

- **WHEN** 用户同时指定 `generate_ca=true` 和 `validity_days`
- **AND** `validity_days` 大于 `validity_days_ca` 或 CA 证书的剩余有效期
- **THEN** 终端证书的实际有效期 SHALL 自动截断为 `min(validity_days, CA 有效期)`
- **AND** 系统 SHALL 在生成日志中记录截断说明

#### Scenario: 参数互斥

- **WHEN** 用户同时指定 `generate_ca=true` 和 `ca_cert_id`（非空）
- **THEN** 系统 SHALL 返回 422，提示"`generate_ca` 与 `ca_cert_id` 不能同时指定"
- **WHEN** 用户指定 `mode=remote` 且 `ca_cert_id` 有值
- **AND** 对应的 CA 记录 `is_ca=true` 但属于不同集群
- **THEN** 系统 SHALL 返回 400，提示"CA 证书不属于该集群"

#### Scenario: 生成 API 响应增强

- **WHEN** 用户指定 `generate_ca=true` 且生成成功
- **THEN** 响应 SHALL 额外包含 `ca_cert_id` 字段，指向 CA 证书记录的 id
- **AND** 响应 SHALL 额外包含 `ca_cert`（CA 证书 PEM）和 `ca_key`（CA 私钥 PEM）

- **WHEN** 用户指定 `generate_client_certs=true` 且生成成功
- **THEN** 响应 SHALL 额外包含 `client_cert_id` 字段，指向客户端证书记录的 id

### Requirement: 证书生成 API 端点

系统 SHALL 提供 REST API 端点用于生成证书，支持 SM2、RSA、ECDSA 三种算法。

#### Scenario: 生成端点参数增强

- **WHEN** 用户发送 POST 请求到 `/api/v1/clusters/{cluster_id}/ssl/generate`
- **AND** 请求体新增以下可选参数：
  - `generate_ca: bool`（默认 false）
  - `generate_client_certs: bool`（默认 false）
  - `ca_cert_id: int`（引用已有 CA 签发，可选）
  - `validity_days_ca: int`（CA 有效期，默认 3650）
- **THEN** 系统 SHALL 正确处理新参数
- **AND** 不影响已有参数的行为

#### Scenario: 客户端证书拒绝发布

- **WHEN** 用户试图发布一个 `cert_type=client` 的 SSL 证书
- **THEN** 前端 SHALL 不显示"发布"按钮
- **AND** API 层面 SHALL 返回 400，提示"客户端证书不需要发布到 Edge 节点"

### Requirement: 发布时携带 CA 证书链

系统 SHALL 在发布国密双证书到 Edge 时，携带 CA 根证书作为证书链。CA 证书内容通过 `ca_cert_id` JOIN 获取，不冗余存储。

#### Scenario: 发布国密证书携带 CA 链

- **WHEN** 用户发布一个 `gm=true` 且 `ca_cert_id` 有值的 SSL 证书
- **THEN** 系统 SHALL 通过 `ca_cert_id` 查询 CA 记录的 `cert` 字段
- **AND** Edge API 请求体 SHALL 额外包含 `cert_chain` 字段
- **AND** `cert_chain` 内容为 `sign_cert + CA 证书 cert` 拼接的 PEM
- **AND** 不影响已有发布流程
