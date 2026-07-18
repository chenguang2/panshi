## Purpose

支持在平台内生成 RSA 和 ECDSA 标准 SSL 证书，供 Chrome、Firefox、Safari 等国际主流浏览器使用。生成的证书自动保存为 SSL 证书记录，复用现有的发布、版本历史、回滚、配置比对等基础设施。

## Requirements

### Requirement: 生成标准自签名证书

系统 SHALL 提供 API 端点为指定集群生成 RSA 或 ECDSA 自签名证书，支持本地和远程两种生成方式，仅支持单证书模式（标准 TLS 不区分签名/加密证书）。

#### Scenario: 生成本地 RSA 单证书
- **WHEN** 用户调用生成 API，指定 `algorithm=rsa`、`mode=local`
- **THEN** 系统 SHALL 检测本地可用 openssl（bundled Tongsuo 优先，其次系统 PATH）
- **AND** 执行以下步骤：生成 RSA 2048-bit 密钥对 → 生成 CSR（SHA-256）→ 自签名证书（SHA-256 签名）
- **AND** 返回的 `cert` 包含证书 PEM，`key` 包含私钥 PEM
- **AND** `gm` 设为 `false`，`sign_cert` 和 `sign_key` 为空
- **AND** `algorithm` 设为 `rsa`
- **AND** `create_method` 设为 `local_generate`

#### Scenario: 生成本地 ECDSA 单证书
- **WHEN** 用户调用生成 API，指定 `algorithm=ecc`、`mode=local`
- **THEN** 系统 SHALL 执行以下步骤：生成 ECDSA P-256（prime256v1）密钥对 → 生成 CSR（SHA-256）→ 自签名证书（ECDSA-with-SHA256 签名）
- **AND** `gm` 设为 `false`
- **AND** `algorithm` 设为 `ecc`
- **AND** `create_method` 设为 `local_generate`

#### Scenario: 远程生成标准证书
- **WHEN** 用户调用生成 API，指定 `algorithm=rsa` 或 `algorithm=ecc`、`mode=remote`、`node_id=<id>`
- **THEN** 系统 SHALL 通过 SSH 连接到指定节点
- **AND** 在远程节点上执行对应算法的密钥对生成、CSR 签发、自签名证书签发（使用 `genrsa` 或 `ecparam -genkey -name prime256v1`，不带 `-sm3` 和 `-sigopt`）
- **AND** 返回结果与本地生成格式一致
- **AND** `create_method` 设为 `remote_generate`

### Requirement: 算法参数验证

系统 SHALL 根据 `algorithm` 参数的值执行校验。

#### Scenario: 支持的标准算法
- **WHEN** 用户传入 `algorithm=rsa`
- **THEN** 系统 SHALL 使用 RSA 2048-bit 算法生成密钥对和证书
- **WHEN** 用户传入 `algorithm=ecc`
- **THEN** 系统 SHALL 使用 ECDSA P-256（prime256v1）算法生成密钥对和证书
- **WHEN** 用户不传入 `algorithm`
- **THEN** 系统 SHALL 使用默认值 `sm2`（与现有行为一致）

#### Scenario: 不支持的算法值
- **WHEN** 用户传入 `algorithm` 值为 `sm2`、`rsa`、`ecc` 之外的字符串
- **THEN** 系统 SHALL 返回 HTTP 422，提示"不支持的算法类型"

### Requirement: 非国密模式下固定单证书

标准 TLS 协议不需要区分签名证书和加密证书，当 `algorithm` 非 `sm2` 时系统 SHALL 忽略双证书选项。

#### Scenario: RSA/ECC 模式下忽略 dual_cert
- **WHEN** 用户调用生成 API，指定 `algorithm=rsa` 或 `algorithm=ecc`
- **AND** 传入 `dual_cert=true`（或 `dual_cert=false`）
- **THEN** 系统 SHALL 仅生成单证书（cert + key）
- **AND** `sign_cert` 和 `sign_key` 为空
- **AND** `gm` 设为 `false`

### Requirement: 证书签名算法

系统 SHALL 根据 `algorithm` 参数使用对应的签名算法。

#### Scenario: 标准证书签名算法
- **WHEN** 生成 RSA 证书成功
- **THEN** 证书的 Signature Algorithm SHALL 为 `sha256WithRSAEncryption`
- **AND** 公钥算法 SHALL 为 `RSA (2048 bits)`
- **WHEN** 生成 ECDSA 证书成功
- **THEN** 证书的 Signature Algorithm SHALL 为 `ecdsa-with-SHA256`
- **AND** 公钥曲线 SHALL 为 `prime256v1 (P-256)`

### Requirement: 标准证书的 openssl 兼容性

系统 SHALL 确保生成标准证书的 openssl 命令不带国密特有的参数（如 `-sm3`、`-sigopt`）。`generate_openssl_cnf()`、`generate_csr()`、`self_sign_certificate()` 等共用函数 SHALL 接受 `hash_alg` 参数以适配不同算法。

#### Scenario: 生成标准证书时不使用国密参数
- **WHEN** `algorithm=rsa` 或 `algorithm=ecc`
- **THEN** CSR 生成命令 SHALL 不包含 `-sm3` 参数
- **AND** 签名命令 SHALL 不包含 `-sigopt` 参数
- **AND** openssl.cnf 的 `default_md` SHALL 为 `sha256` 而非 `sm3`
- **AND** 使用 SHA-256 作为默认摘要算法

### Requirement: 证书生成 API 端点适配

系统 SHALL 复用 `/api/v1/clusters/{cluster_id}/ssl/generate` 端点，通过 `algorithm` 参数区分证书类型。

#### Scenario: 标准证书生成端点
- **WHEN** 用户发送 POST 请求到 `/api/v1/clusters/{cluster_id}/ssl/generate`
- **AND** 请求体包含 `algorithm=rsa` 或 `algorithm=ecc`
- **AND** `name`（必填）、`common_name`（必填）、`mode`（必填）
- **THEN** 系统 SHALL 返回 HTTP 201
- **AND** 响应体为 `SslCertificateResponse` JSON，`gm` 字段为 `false`，`algorithm` 字段为对应值

#### Scenario: 标准证书发布配置
- **WHEN** 用户发布 `gm=false` 的 SSL 证书到 Edge 节点
- **THEN** 系统 SHALL 在发布配置中不包含 `certs`、`keys`、`gm` 字段
- **AND** 仅发送 `cert` 和 `key`（标准 TLS 配置）

### Requirement: 上传证书时自动检测算法

系统 SHALL 在创建 SSL 证书时，如果未指定 `algorithm`，自动从证书 PEM 解析签名算法以确定证书类型。

#### Scenario: 后端自动检测算法
- **WHEN** 用户上传证书 PEM（`cert` 字段非空），且请求中 `algorithm` 为空
- **THEN** 系统 SHALL 调用 `openssl x509 -text` 解析证书
- **AND** 根据 Signature Algorithm 推断 `algorithm` 值：
  - `sha256WithRSAEncryption` → `rsa`
  - `ecdsa-with-SHA256` → `ecc`
  - `sm2-with-SM3` → `sm2`
- **AND** 将检测结果存入 `algorithm` 字段
- **WHEN** 签名算法无法识别
- **THEN** 系统 SHALL 将 `algorithm` 设为 `null` 或空字符串

#### Scenario: 用户指定 algorithm 优先
- **WHEN** 用户上传证书且请求中同时提供了 `algorithm` 字段
- **THEN** 系统 SHALL 以用户指定的值为准，不触发自动检测

### Requirement: Edge 导入时检测算法

系统 SHALL 在从 Edge 节点导入 SSL 证书时，根据证书内容和已有字段自动设置 `algorithm`。

#### Scenario: 导入国密证书
- **WHEN** Edge 导入的数据中 `gm=true`
- **THEN** 系统 SHALL 直接设 `algorithm=sm2`

#### Scenario: 导入非国密证书
- **WHEN** Edge 导入的数据中 `gm=false` 或未设置
- **THEN** 系统 SHALL 调用 `detect_cert_algorithm()` 从 `cert` 字段的 PEM 内容检测算法
- **AND** 将检测结果存入 `algorithm` 字段

### Requirement: 数据库 model 支持 algorithm 字段

系统 SHALL 在 `SslCertificate` 模型中增加 `algorithm` 列，用于持久化证书算法类型。

#### Scenario: 模型字段
- **WHEN** 查询 SSL 证书记录
- **THEN** 响应中 SHALL 包含 `algorithm` 字段
- **AND** `algorithm` 取值范围为 `sm2`、`rsa`、`ecc` 或 `null`

#### Scenario: 存量数据回填
- **WHEN** 执行数据库 migration
- **THEN** 系统 SHALL 对 `algorithm IS NULL` 的存量记录遍历执行 `detect_cert_algorithm()` 回填
- **AND** 回填失败的记录 `algorithm` 保持 `null`

### Requirement: 前端显示算法标记

系统 SHALL 在证书列表和详情中显示算法类型。

#### Scenario: 卡片列表显示算法 badge
- **WHEN** 证书列表加载完成
- **THEN** 每张证书卡片 SHALL 根据 `algorithm` 显示对应的 badge：
  - `sm2` + `sign_cert` 非空 → "SM2 双证书"（primary 色）
  - `sm2` + `sign_cert` 为空 → "SM2 单证书"（primary 色）
  - `rsa` → "RSA 2048"（secondary 色）
  - `ecc` → "ECC P-256"（secondary 色）
- **AND** 生成成功的提示消息内容根据 `algorithm` 动态变化

#### Scenario: 详情和下载隐藏非 GM 字段
- **WHEN** `algorithm` 非 `sm2`
- **THEN** 查看详情页（SslViewDrawer）SHALL 隐藏 `sign_cert` 和 `sign_key` 的展示区域
- **AND** 下载对话框（SslCertDownloadDialog）SHALL 仅列出 `cert` 和 `key` 的下载选项
