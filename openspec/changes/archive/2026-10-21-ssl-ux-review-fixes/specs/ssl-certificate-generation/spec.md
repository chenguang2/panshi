# ssl-certificate-generation 变更（ssl-ux-review-fixes）

## MODIFIED Requirements

### Requirement: 证书生成 API 端点

系统 SHALL 提供 REST API 端点用于生成证书，支持 SM2、RSA、ECDSA 三种算法。所有算法的证书均 SHALL 由集群内 CA 签发（`ca_cert_id` 全算法必填）。生成过程中执行的所有 openssl 命令 SHALL 被记录并返回。

#### Scenario: 生成端点参数

- **WHEN** 用户发送 POST 请求到 `/api/v1/clusters/{cluster_id}/ssl/generate`
- **AND** 请求体包含：
  - `name`（必填）
  - `common_name`（必填）
  - `algorithm`（可选，默认 sm2）
  - `ca_cert_id`（必填，所有算法——证书均由 CA 签发；缺失返回 400）
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

#### Scenario: 响应模型增加字段
- **WHEN** 用户通过生成 API 创建证书
- **THEN** 返回的 `SslCertificateResponse` SHALL 包含 `generate_log` 字段
- **AND** `generate_log` SHALL 持久化到数据库 `SslCertificate.generate_log` 字段

#### Scenario: 查询时返回历史日志
- **WHEN** 用户通过 `GET /api/v1/clusters/{cluster_id}/ssl/{cert_id}` 查询证书
- **THEN** 如果该证书有 `generate_log` 数据
- **AND** 响应中的 `generate_log` SHALL 包含该证书生成时的命令记录

#### Scenario: 缺失 CA 时报错可读
- **WHEN** 请求未携带 `ca_cert_id`
- **AND** 该集群没有任何 CA 根证书
- **THEN** 系统 SHALL 返回 400，detail 说明原因与解决方式
- **AND** detail SHALL NOT 包含 API 路径等技术细节（如 `(POST /clusters/{id}/ssl/ca)`）
