## Purpose

支持在平台内直接生成国密 SM2 CA 根证书，作为证书信任链的锚点。生成的 CA 证书可用于签发服务端和客户端证书。CA 生成有独立的 API 端点，与证书签发解耦。

## Requirements

### Requirement: 创建 SM2 CA 根证书

系统 SHALL 提供独立的 API 端点 `POST /api/v1/clusters/{cluster_id}/ssl/ca` 为指定集群生成 SM2 CA 根证书。

#### Scenario: 创建 CA 根证书

- **WHEN** 用户调用 CA 创建端点
- **AND** 请求体包含 `name`（必填）
- **THEN** 系统 SHALL 执行以下步骤：
  - 生成 SM2 CA 密钥对（`ecparam -genkey -name SM2`）
  - 生成 CA CSR
  - 自签名 CA 证书，有效期默认 3650 天（10 年），可通过 `validity_days` 覆盖
  - `common_name` 可选，默认取 `name` 的值
- **AND** CA 证书 SHALL 包含以下扩展：
  - `basicConstraints = CA:TRUE, pathlen:0`
  - `keyUsage = critical, keyCertSign, cRLSign`
  - `subjectKeyIdentifier = hash`
  - `authorityKeyIdentifier = keyid:always,issuer`

#### Scenario: CA 证书存储

- **WHEN** CA 证书生成成功
- **THEN** 系统 SHALL 创建一条 `SslCertificate` 记录
- **AND** `is_ca` 设为 `true`
- **AND** `cert` 字段存储 CA 证书 PEM
- **AND** `private_key` 字段存储 CA 私钥 PEM（API 默认不返回）
- **AND** `gm` 设为 `true`
- **AND** `algorithm` 设为 `sm2`
- **AND** `create_method` 设为 `local_generate`

#### Scenario: 响应

- **WHEN** CA 创建成功
- **THEN** 响应 SHALL 返回 HTTP 201
- **AND** 响应体为 `SslCertificateResponse`
- **AND** `is_ca=true`
- **AND** `private_key` 字段 SHALL 为 `null`（不返回私钥）
- **AND** `ca_cert_id` 为 `null`（CA 无上级 CA）

### Requirement: CA 使用约束

CA 私钥仅在证书签发时使用，不用于 TLS 握手。CA 证书不需要发布到 Edge 节点。

#### Scenario: CA 信息展示

- **WHEN** 用户查看 CA 证书记录
- **THEN** 前端 SHALL 标识为"CA 根证书"
- **AND** 展示 CA 证书的 Subject、有效期、密钥用途信息

#### Scenario: CA 不参与发布

- **WHEN** 用户触发发布操作
- **AND** 目标证书记录 `is_ca=true`
- **THEN** 系统 SHALL 提示"CA 证书不需要发布到 Edge 节点"

#### Scenario: CA 证书下载

- **WHEN** 用户查看 CA 证书记录详情
- **THEN** 前端 SHALL 提供 CA 证书文件（`.crt`）下载按钮

#### Scenario: CA 私钥访问保护

- **WHEN** 用户通过 `GET /api/v1/clusters/{id}/ssl/{id}` 查询 CA 证书详情
- **THEN** 响应体 SHALL **不包含** `private_key` 字段（或返回 `null`）
- **WHEN** 用户需要下载 CA 私钥
- **THEN** 前端 SHALL 弹出确认对话框
- **AND** 确认后调用专用接口 `GET /api/v1/ssl/{id}/ca-key`
- **AND** 该接口 SHALL 返回 CA 私钥 PEM 内容

#### Scenario: CA 删除保护

- **WHEN** 用户试图删除一条 `is_ca=true` 的记录
- **AND** 存在其他记录的 `ca_cert_id` 指向该 CA
- **THEN** 系统 SHALL 返回 400，提示"请先删除或取消关联使用该 CA 签发的证书"

#### Scenario: 多 CA 提示

- **WHEN** 用户创建新的 CA
- **AND** 同一集群已存在 CA 记录
- **THEN** 前端 SHALL 弹出软提示"集群已存在 CA 根证书，创建多个 CA 可能导致管理复杂"
- **AND** 不阻止继续创建
