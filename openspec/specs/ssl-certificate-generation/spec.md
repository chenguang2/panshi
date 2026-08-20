## Purpose

支持在平台内直接生成 SSL 证书，支持 SM2 国密（双证书模式）以及 RSA/ECDSA 标准证书，无需通过外部工具手动生成后再上传。生成的证书自动保存为 SSL 证书记录，复用现有的发布、版本历史、回滚、配置比对等基础设施。

## Requirements

### Requirement: 生成 SM2 证书

系统 SHALL 提供 API 端点为指定集群生成 SM2 国密证书。SM2 **强制双证书模式**（加密+签名），不再支持单证书。SM2 证书必须由 CA 签发，不再支持自签名。

#### Scenario: 生成本地双证书（国密标准模式）

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

#### Scenario: 参数验证

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

#### Scenario: 响应模型增加字段
- **WHEN** 用户通过生成 API 创建证书
- **THEN** 返回的 `SslCertificateResponse` SHALL 包含 `generate_log` 字段
- **AND** `generate_log` SHALL 持久化到数据库 `SslCertificate.generate_log` 字段

#### Scenario: 查询时返回历史日志
- **WHEN** 用户通过 `GET /api/v1/clusters/{cluster_id}/ssl/{cert_id}` 查询证书
- **THEN** 如果该证书有 `generate_log` 数据
- **AND** 响应中的 `generate_log` SHALL 包含该证书生成时的命令记录

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

#### Scenario: IP SAN 必须是合法 IP
- **WHEN** 用户传入 `ip_sans` 包含非 IP 值（如 `abc`、`999`）
- **THEN** 系统 SHALL 拒绝该请求并返回 422
- **AND** 错误信息 SHALL 指明无效的 IP 地址

#### Scenario: IP SAN 接受合法 IPv4 与 IPv6
- **WHEN** 用户传入 `ip_sans: ["10.0.0.1", "2001:db8::1"]`
- **THEN** 系统 SHALL 接受（IPv4 与 IPv6 均合法）
- **AND** 生成的证书 SAN SHALL 包含 `IP:10.0.0.1,IP:2001:db8::1`

#### Scenario: 强制加入系统保留域名（服务端证书）
- **WHEN** 用户调用生成 API 生成服务端证书，传入任意 `dns_sans`（或为空）
- **THEN** 系统 SHALL 将系统保留域名 `edge.local` 强制合并进 DNS SAN
- **AND** 生成的证书 subjectAltName SHALL 包含 `DNS:edge.local`
- **AND** `edge.local` 置前且去重（若用户已传入则不重复）
- **AND** 合并前 SHALL 将 DNS 域名归一化为小写（`strip().lower()`），`EDGE.LOCAL`/`Edge.Local` 与 `edge.local` 视为同一项

#### Scenario: 客户端证书不强制注入
- **WHEN** 生成 SM2 客户端双证书（`generate_client_certs=true`）或 `cert_type=client`
- **THEN** 客户端证书的 subjectAltName SHALL 仅包含用户提供的 `dns_sans`/`ip_sans`
- **AND** 系统 SHALL 不强制合并 `edge.local`

#### Scenario: DB sni 字段同步（服务端证书）
- **WHEN** 系统生成服务端证书且强制加入 `edge.local`
- **THEN** 证书记录的 `sni` 字段 SHALL 包含 `edge.local`
- **AND** `sni` 与证书 subjectAltName 保持一致（列表内容一致，`sni` 无 `DNS:`/`IP:` 前缀）

#### Scenario: 更新路径强制保留
- **WHEN** 用户更新 server 类型证书（`cert_type == "server"` 且非 CA）的 `sni` 字段
- **THEN** 系统 SHALL 强制将 `edge.local` 合并进新的 `sni` 值（归一化去重后写回）
- **AND** 更新 client 类型证书的 `sni` 时 SHALL 不合并

#### Scenario: 回滚路径强制保留
- **WHEN** 用户将 server 类型证书回滚到历史版本
- **THEN** 回滚后的 `sni` 字段 SHALL 强制包含 `edge.local`（按回滚后的 `cert_type` 判断）

#### Scenario: 导入路径不强制
- **WHEN** 用户导入（添加已有）server 证书且 `sni` 不含 `edge.local`
- **THEN** 系统 SHALL 接受该操作（不强制注入、不阻断）
- **AND** 前端 SHALL 在导入表单提示建议包含系统保留域名 `edge.local`

### Requirement: IP SAN 输入校验

系统 SHALL 在生成证书界面校验 IP SAN 输入的格式，仅接受合法 IPv4/IPv6，拒绝非法输入。

#### Scenario: 前端拒绝非法 IP
- **WHEN** 用户在 IP SAN 输入框输入非 IP 值（如 `abc`）
- **THEN** 前端 SHALL 拒绝将该值加入 IP SAN 列表
- **AND** SHALL 提示用户"无效的 IP 地址"

#### Scenario: 前端接受合法 IP
- **WHEN** 用户在 IP SAN 输入框输入合法 IP（如 `10.0.0.1` 或 `2001:db8::1`）
- **THEN** 前端 SHALL 将该值加入 IP SAN 列表

#### Scenario: 后端兜底校验
- **WHEN** 请求绕过前端直接调用生成 API，且 `ip_sans` 包含非法 IP
- **THEN** 后端 SHALL 返回 422

### Requirement: 系统保留域名不可由用户移除

系统 SHALL 将 `edge.local` 视为系统保留域名，在生成证书的界面中始终可见且不可被用户删除。

#### Scenario: 生成对话框默认展示且锁定
- **WHEN** 用户打开证书生成对话框
- **THEN** DNS SAN 输入区 SHALL 默认展示 `edge.local` 标签
- **AND** `edge.local` 标签 SHALL 以锁定样式显示（无删除按钮，标记"系统保留"）
- **AND** 用户 SHALL 无法删除该标签

#### Scenario: 提交始终包含系统保留域名
- **WHEN** 用户在生成对话框提交（含或不含其他 DNS SAN）
- **THEN** 提交的 `dns_sans` SHALL 始终包含 `edge.local`
- **AND** 后端 SHALL 兜底合并 `edge.local`（即使前端未传入也生效）
- **AND** 用户手动输入的 `EDGE.LOCAL`/`Edge.Local` SHALL 与锁定 `edge.local` 去重（视为同一项）

#### Scenario: 仅系统保留域名的证书允许
- **WHEN** 用户未添加任何其他 DNS/IP SAN，仅保留锁定的 `edge.local`
- **THEN** 系统 SHALL 允许提交（`edge.local` 计入"至少一个 SAN"的有效性判断）

#### Scenario: 编辑查看时标注系统保留
- **WHEN** 用户编辑或查看证书
- **AND** 证书 SAN 包含 `edge.local`（大小写不敏感）
- **THEN** 界面 SHALL 将 `edge.local` 标注为"系统保留"

#### Scenario: 列表展示时标注系统保留
- **WHEN** 用户在证书列表页查看证书
- **AND** 证书 `sni` 包含 `edge.local`（大小写不敏感）
- **THEN** 列表 SHALL 将 `edge.local` 标注为"系统保留"

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
- **WHEN** 用户查看一个通过"生成"方式创建的证书（`create_method` 为 `local_generate`）
- **THEN** 查看弹窗 SHALL 包含"生成日志"可折叠区块
- **AND** 展示该证书生成时的命令执行记录（从 DB 读取）
