## Context

磐石 Admin 的证书管理功能目前已支持 SM2 国密证书的生成（本地/远程）、上传、发布、版本管理、回滚等完整生命周期。国密证书使用双证书（签名证书 + 加密证书）模式，仅适用于支持国密 TLCP/NTLS 协议的浏览器（360 国密版、密信、红莲花）。

Chrome、Firefox、Safari 等国际主流浏览器不支持国密协议。要让他们访问 Edge 网关的 HTTPS 端口，必须部署标准 TLS 证书（RSA 或 ECDSA 算法）。目前用户只能通过外部工具（如 openssl CLI）手动生成标准证书后再上传到平台。

生成层使用 `backend/bin/openssl`（bundled Tongsuo）执行密钥生成和签名操作。Tongsuo 基于 OpenSSL，天生支持 RSA 和 ECDSA 算法——无需额外依赖。

## Goals / Non-Goals

**Goals:**
- 在现有证书生成流程中增加 RSA 2048-bit 和 ECDSA P-256 标准证书的自签名生成能力
- API 和前端增加算法选择参数，非 SM2 模式下固定为单证书
- 标准证书复用现有 Tongsuo 二进制，不引入额外 OpenSSL 依赖
- 标准证书的发布、版本管理、回滚等复用现有基础设施（`gm=false` 即可）
- 前端证书生成弹窗增加算法选择器，非 SM2 时隐藏双证书选项

**Non-Goals:**
- 不涉及 CA 层级证书链签发（保持自签名模式）
- 不修改现有 SM2 证书生成的任何行为，完全向后兼容
- 不涉及 Edge 端双算法自适应部署编排（由用户自行在 Edge 上配置既有的双算法部署功能）
- 不涉及证书续期、ACME 自动申请

## Decisions

### Decision 1: 复用 Tongsuo 生成标准证书（不引入独立 OpenSSL）

- **选项 A（选用）**: 使用同一 Tongsuo `openssl` 二进制生成所有算法证书
- **选项 B**: 额外 bundld 一个标准 OpenSSL 二进制，Tongsuo 只做 SM2
- **选择理由**: Tongsuo 已内含完整的 RSA、ECC 支持，用同一二进制生成不同算法证书是最简洁的方案，减少部署包体积和维护成本。Tongsuo 项目文档明确声明支持"国际主流算法：ECDSA、RSA、AES、SHA 等"。

### Decision 2: API 用 `algorithm` 参数区分证书类型

- **选项 A（选用）**: 在证书相关 Schema（生成请求、模型、响应）增加 `algorithm` 字段，取值 `sm2` | `rsa` | `ecc`
- **选项 B**: 通过 `gm` 布尔值和 `dual_cert` 组合推断
- **选择理由**: `gm` + `dual_cert` 组合无法表达 ECDSA 场景；显式 `algorithm` 字段可以精确表达、便于前端渲染、且与未来可能的算法扩展（如 Ed25519）兼容。默认值 `sm2` 保证向后兼容。

### Decision 3: 非 SM2 模式固定为单证书

标准 TLS 协议使用单证书（一个密钥对签一个证书），无需双证书拆分。当 `algorithm=rsa` 或 `algorithm=ecc` 时：
- `dual_cert` 参数被忽略（或固定为 `false`）
- 仅生成 `cert` + `key`，`sign_cert`/`sign_key` 为空
- `gm` 设为 `false`

### Decision 4: 证书签名算法选择

| 算法 | 密钥生成 | CSR 哈希 | 签名算法 |
|---|---|---|---|
| RSA | `genrsa -out key 2048` | SHA-256（默认） | `sha256WithRSAEncryption` |
| ECDSA | `ecparam -genkey -name prime256v1` | SHA-256（默认） | `ecdsa-with-SHA256` |
| SM2 | `ecparam -genkey -name SM2` | SM3 | `SM2-with-SM3` |

SHA-256 是现代标准选择，Chrome 要求证书签名哈希至少 SHA-256（SHA-1 已被拒绝）。

### Decision 5: 共用函数参数化（避免硬编码国密参数）

`generate_openssl_cnf()`、`generate_csr()`、`self_sign_certificate()` 当前硬编码了 `-sm3`、`default_md = sm3`、`-sigopt` 等国密参数。改为接受 `hash_alg` 参数：
- SM2 调用传 `hash_alg="sm3"`
- RSA/ECDSA 调用传 `hash_alg="sha256"`
- `_sigopt_args()` 仅在 SM2 + Tongsuo 时返回非空

### Decision 6: `detect_openssl()` 按算法检测能力

现有检测只检查 SM2 支持，对 RSA/ECDSA 生成过强约束。改为：
- 新增 `available: bool` 通用可用性标记（只要 openssl 二进制存在且可执行）
- `sm2_supported` 保留用于 SM2 生成校验
- `LocalProvider` 根据 `algorithm` 参数决定检测内容：`algorithm=sm2` 要求 `sm2_supported=true`，`algorithm=rsa` 或 `ecc` 只要求 `available=true`

### Decision 7: 远程生成按算法分派独立模板

在 `cluster_ssl.py` 中为 RSA/ECDSA 分别写独立的远程生成函数（类似现有 `_remote_generate_single()` 结构），用 `genrsa` / `ecparam -genkey -name prime256v1` 而非 `ecparam -genkey -name SM2`，不带 `-sm3` 和 `-sigopt`。根据 `algorithm` 分发。

### Decision 8: 上传和导入证书时自动检测算法

新增 `detect_cert_algorithm(cert_pem: str) -> str` 函数，通过 `openssl x509 -text` 解析证书 PEM 确定算法。
- 上传场景：`SslCertificateCreate` 中如果 `algorithm` 为空，自动检测后填入
- Edge 导入场景：`convert_ssl_certificate()` 中如果 `gm=false`，自动检测
- 前端上传表单不加算法选择器，完全由后端检测
- 生成场景直接写入已知算法，不需要检测

### Decision 9: 前端显示适配算法标记

- SslList.vue 卡片增加算法 badge（SM2 / RSA 2048 / ECC P-256）
- 生成成功提示文案根据算法泛化
- SslViewDrawer 和 SslCertDownloadDialog 中 `sign_cert`/`sign_key` 的显示/下载项根据 `algorithm` 而非 `gm` 控制
- SslGenerateDialog.vue 标题改为"生成证书"，增加算法选择器，非 SM2 时隐藏双证书选项

## Risks / Trade-offs

- **[Tongsuo 构建不包含 RSA]** → 低风险。默认 Tongsuo Configure 包含 RSA。可在部署打包脚本中确认 `no-rsa` 未被传入。
- **[标准证书的远程生成]** → Edge 节点的 Tongsuo 也需要支持 RSA/ECDSA。若 Edge 节点的 Tongsuo 被裁剪过，远程生成可能失败。措施：远程生成前检测 openssl flavor 和算法支持，不支持时返回清晰错误提示。
- **[与现有 SM2 生成的并行兼容]** → `algorithm` 默认值为 `sm2`，现有 API 调用不加此字段完全向后兼容。前端旧的"生成国密证书"按钮行为不变。
- **[存量证书无 algorithm 字段]** → migration 中需为存量证书回填算法：遍历所有 `algorithm IS NULL` 的记录，调用 `detect_cert_algorithm()` 解析 cert PEM 后更新。
