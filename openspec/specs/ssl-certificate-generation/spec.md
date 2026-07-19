## Purpose

支持在平台内直接生成 SSL 证书，支持 SM2 国密（含双证书模式）以及 RSA/ECDSA 标准证书，无需通过外部工具手动生成后再上传。生成的证书自动保存为 SSL 证书记录，复用现有的发布、版本历史、回滚、配置比对等基础设施。

## Requirements

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

### Requirement: OpenSSL 版本和参数适配

系统 SHALL 根据 openssl 发行版类型和算法类型自动适配命令行参数。

#### Scenario: bundled Tongsuo + SM2 加 sigopt
- **WHEN** 检测到 openssl 来源为 `backend/bin/openssl`（bundled Tongsuo）
- **AND** `openssl version` 输出含 "Tongsuo"
- **AND** 当前算法为 SM2（`hash_alg=sm3`）
- **THEN** 签名操作 SHALL 添加 `-sigopt "sm2_id:1234567812345678"` 参数

#### Scenario: 标准算法不传递 sigopt
- **WHEN** 当前算法为 RSA 或 ECDSA（`hash_alg=sha256`）
- **THEN** 签名操作 SHALL 不添加 `-sigopt` 参数
- **AND** CSR 和签名操作 SHALL 使用 `-sha256` 而非 `-sm3`

#### Scenario: 远程节点 Tongsuo + SM2 加 sigopt
- **WHEN** 远程节点 `openssl version` 输出含 "Tongsuo" 或 "BabaSSL"
- **AND** 当前算法为 SM2
- **THEN** 签名操作 SHALL 添加 `-sigopt "sm2_id:1234567812345678"` 参数

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

#### Scenario: 生成端点
- **WHEN** 用户发送 POST 请求到 `/api/v1/clusters/{cluster_id}/ssl/generate`
- **AND** 请求体包含 `name`（必填）、`common_name`（必填）、`mode`（必填，local/remote）、`algorithm`（可选，默认 sm2）、`node_id`（remote 时必填）、`dns_sans`（可选数组）、`ip_sans`（可选数组）、`validity_days`（可选，默认 365）、`dual_cert`（可选 bool，默认 true，仅 SM2 模式有效）、`cert_type`（可选，默认 server）
- **THEN** 系统 SHALL 返回 HTTP 201
- **AND** 响应体为 `SslCertificateResponse` JSON
- **AND** 响应体新增 `generate_log` 字段，类型为 `list[CommandLogEntry]`
- **AND** 每个 `CommandLogEntry` 包含：`step`（步骤名称）、`command`（完整命令行）、`exit_code`（退出码）、`stdout`（标准输出前 500 字符）、`stderr`（标准错误）
- **WHEN** `cluster_id` 不存在
- **THEN** 系统 SHALL 返回 HTTP 404
- **WHEN** 指定 `mode=remote` 且 `node_id` 不属于该集群
- **THEN** 系统 SHALL 返回 HTTP 400
- **WHEN** 传入 `algorithm` 值为 `sm2`、`rsa`、`ecc` 之外的字符串
- **THEN** 系统 SHALL 返回 HTTP 422

#### Scenario: 本地生成记录每个 openssl 命令
- **WHEN** 用户指定 `mode=local`
- **AND** 系统执行本地 openssl 命令生成证书
- **THEN** `generate_log` SHALL 包含每个 `_run_openssl()` 调用的记录
- **AND** `command` SHALL 为完整的 openssl 命令字符串（含参数，路径已解析）
- **AND** `exit_code` SHALL 为 subprocess 的实际退出码

#### Scenario: 探测阶段的命令也记录
- **WHEN** 用户指定 `mode=local`
- **AND** 系统调用 `detect_openssl()` 进行 openssl 探测
- **THEN** 探测阶段的命令（如 `openssl version`、`openssl ecparam -list_curves`）SHALL 也计入 `generate_log`
- **AND** 探测阶段排在正式生成步骤之前
- **AND** 即使探测失败（如 openssl 不可用），已执行的探测命令 SHALL 仍然返回给前端

#### Scenario: 远程生成记录 SSH 命令
- **WHEN** 用户指定 `mode=remote`
- **AND** 系统通过 SSH 在远程节点执行脚本
- **THEN** `generate_log` SHALL 包含每一步的远程命令记录
- **AND** 每个步骤使用 `===PASHI_STEP:xxx===` 和 `===PASHI_EXIT:code===` 标记解析
- **AND** 每个步骤独立记录退出码

#### Scenario: 响应模型增加字段
- **WHEN** 用户通过生成 API 创建证书
- **THEN** 返回的 `SslCertificateResponse` SHALL 包含 `generate_log` 字段
- **AND** `generate_log` SHALL 持久化到数据库 `SslCertificate.generate_log` 字段

#### Scenario: 查询时返回历史日志
- **WHEN** 用户通过 `GET /api/v1/clusters/{cluster_id}/ssl/{cert_id}` 查询证书
- **THEN** 如果该证书有 `generate_log` 数据
- **AND** 响应中的 `generate_log` SHALL 包含该证书生成时的命令记录

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
- **AND** 使用 `req -new -sha256` 和 `-config openssl.cnf` 生成 CSR 并自签名（避免 Tongsuo 默认路径不存在问题）
- **AND** 不带 `-sm3` 和 `-sigopt` 参数

#### Scenario: 远程生成 ECDSA 证书
- **WHEN** `algorithm=ecc`、`mode=remote`
- **THEN** 远程脚本 SHALL 使用 `ecparam -genkey -name prime256v1` 生成密钥
- **AND** 使用 SHA-256 摘要并传递 `-config openssl.cnf`

### Requirement: 上传时自动检测算法

系统 SHALL 在创建 SSL 证书时自动检测算法。

#### Scenario: 创建端点自动检测
- **WHEN** 用户发送 POST 到 `/api/v1/clusters/{cluster_id}/ssl` 且 `algorithm` 为空
- **THEN** 系统 SHALL 调用 `detect_cert_algorithm()` 从 `cert` PEM 解析算法
- **AND** 检测结果写入 `algorithm` 字段
- **WHEN** `algorithm` 已指定
- **THEN** 跳过自动检测，以用户指定值为准

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

### Requirement: 生成命令写入日志文件

系统 SHALL 将证书生成过程中的所有命令写入文件日志，用于事后排查。

#### Scenario: 日志文件路径
- **WHEN** 系统执行证书生成
- **THEN** 命令日志 SHALL 写入 `logs/cert_generate.log`（不在 `logs/edge/` 目录下）
- **AND** 日志格式为 JSON Lines（每行一个 JSON 对象）
- **AND** 每个 JSON 对象包含：`time`、`cluster_id`、`cluster_name`、`cert_name`、`step`、`command`、`exit_code`、`stderr`

#### Scenario: 使用 Python logging 写入
- **WHEN** 系统写入命令日志
- **THEN** SHALL 使用 `logging.getLogger("cert_generate")` + 独立 FileHandler，不与 EdgeLogger 耦合
- **AND** `propagate` SHALL 设为 `False`，避免重复写入 `app.log`
- **AND** formatter SHALL 只输出 `%(message)s`（JSON 文本）

#### Scenario: 日志内容完整
- **WHEN** 生成本地证书
- **THEN** 日志 SHALL 记录所有 `_run_openssl()` 调用的命令、退出码和 stderr
- **AND** 包括 openssl 探测阶段的命令
- **WHEN** 远程生成证书
- **THEN** 日志 SHALL 记录每个步骤的 openssl 命令和退出码

### Requirement: 前端展示真实命令日志

证书生成对话框 SHALL 在生成完成后展示命令执行记录，替代当前假进度动画。

#### Scenario: 生成完成展示命令列表
- **WHEN** 证书生成成功
- **THEN** 对话框 SHALL 按顺序展示 `generate_log` 中的所有步骤
- **AND** 每个步骤显示：步骤名称、命令文本（可折叠展开）、退出码
- **AND** 所有步骤标记为"已完成"（绿色勾）

#### Scenario: 生成失败展示错误命令
- **WHEN** 证书生成失败
- **THEN** 对话框 SHALL 展示已成功执行的步骤（绿色勾）
- **AND** 失败步骤 SHALL 显示红色叉号和错误命令
- **AND** 失败步骤的 `stderr` SHALL 直接展示给用户
- **AND** 失败步骤之后的步骤 SHALL 不显示

#### Scenario: 证书详情查看命令日志
- **WHEN** 用户查看一个通过"生成"方式创建的证书（`create_method` 为 `local_generate` 或 `remote_generate`）
- **THEN** 查看弹窗 SHALL 包含"生成日志"可折叠区块
- **AND** 展示该证书生成时的命令执行记录（从 DB 读取）
