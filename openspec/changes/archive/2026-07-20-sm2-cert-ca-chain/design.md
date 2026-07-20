## Context

当前 SM2 国密双证书生成流程（`generate_dual_certificates()`）采用自签名模式——签名证书和加密证书各自用自己生成的密钥对自我签名，不产生也不涉及任何 CA 证书。这种方式在标准 PKI 和国密 TLCP/NTLS 协议中存在问题：

1. **无信任锚点**：双向认证时客户端无法验证服务端证书的合法性，因为不存在可信任的 CA
2. **无法构建证书链**：Edge 网关的国密 SSL 配置期望完整的证书链（Root CA → 终端证书），自签名证书无法形成链
3. **无客户端证书**：ECDHE-SM2-* 套件强制双向认证，但系统当前只能生成服务端证书
4. **扩展缺失**：自签名时未设置 `keyUsage`、`basicConstraints` 等关键扩展字段

## Goals / Non-Goals

**Goals:**

- 新增 CA 根证书生成能力（SM2 密钥对 + 自签名 CA 证书，含 `CA:TRUE`、`keyCertSign`、`cRLSign`）
- 新增 CA 签发函数 `ca_sign_csr()`，支持用 CA 证书+私钥签署 CSR
- 改造 `generate_dual_certificates()`，**SM2 强制 CA 签发**（移除自签名回退路径），RSA/ECC 保持自签名不变
- 新增客户端双证书生成能力（由指定 CA 签发）
- CA 创建和证书签发分离为独立 API 端点
- DB 模型增加 `is_ca`、`ca_cert_id` 字段，支持 CA 证书的存储和关联
- 发布到 Edge 时携带 CA 证书链
- 前端支持 CA 创建、CA 列表、CA 选择、客户端证书下载
- 移除远程证书生成模式（CA 信任锚点必须中心化）

**Non-Goals:**

- 不涉及多级 CA（仅 Root CA → 终端证书，不引入 Sub CA 层级）
- 不涉及证书吊销（CRL/OCSP）
- 不改动 RSA/ECDSA 证书生成流程（保持自签名）
- 不涉及 CA 证书的独立管理页面（CA 作为 SSL 证书记录的一种类型，而非独立管理入口）
- 远程模式不再支持

## Decisions

### Decision 1: CA 作为 SSL 证书记录的 subtype

**方案**：`SslCertificate` 表新增 `is_ca`（Boolean）和 `ca_cert_id`（FK → `ps_ssl_certificate.id`）字段，CA 证书本身是一条 `SslCertificate` 记录（`is_ca=true`，`ca_cert_id=null`）。被 CA 签发的普通证书通过 `ca_cert_id` 外键引用 CA 记录，不加冗余的 `ca_cert` 字段，发布时通过 JOIN 获取 CA 证书内容。

| 记录类型 | `is_ca` | `ca_cert_id` | `ca_cert` 冗余字段 |
|----------|---------|-------------|-------------------|
| CA 证书 | `true` | `null` | 不加 |
| CA 签发的 SM2 终端证书 | `false` | CA 记录 id | 不加 |
| RSA/ECC 自签名证书 | `false` | `null` | 不加 |

**理由**：
- 复用现有 SSL 证书的完整基础设施（列表、版本、对比）
- 避免数据冗余和一致性问题
- CA 私钥通过单独接口获取，API 默认不返回

**约束**：
- 删除 CA 时，如果存在 `ca_cert_id` 指向该 CA 的记录，禁止删除（硬限制）
- 同一集群允许存在多个 CA
- 客户端证书（`cert_type=client`）前后端双重阻止发布操作
- CA 证书（`is_ca=true`）前后端双重阻止发布操作

### Decision 2: SM2 强制 CA 签发，RSA/ECC 保持自签名

**方案**：

- 所有 SM2 服务器/客户端证书必须由 CA 签发，移除 `generate_dual_certificates()` 中的自签名回退路径
- SM2 **强制双证书模式**（`dual_cert=true`），单证书模式对国密 NTLS/TLCP 无实际用途
- RSA/ECC 证书保持现有自签名不变，不引入 CA 逻辑
- 不影响已存在的自签名 SM2 证书记录（保留展示，但提示用户重新签发）

**理由**：
- SM2 自签名证书在国密 NTLS/TLCP 生产环境中不可用（缺少 `cert_chain`），保留它只会误导用户
- 消除 `if ca else self-sign` 分支逻辑，代码路径简洁
- 所有新生成的 SM2 证书自动拥有完整的信任链
- RSA/ECC 的标准 TLS 协议完全接受自签名证书，没有必需 CA 的技术需求

### Decision 3: 移除远程证书生成模式

**方案**：移除 `mode=remote` 相关的所有代码。证书生成全部走本地（管理服务器 openssl/Tongsuo）。

**理由**：
- CA 私钥是信任锚点，不应出现在 Edge 节点上
- 如果远程生成也要走 CA 签名，意味着必须把 CA 私钥传到 Edge 节点，这是安全灾难
- 如果远程生成不走 CA（自签名），则与"SM2 强制 CA"矛盾
- 远程生成的证书最终要传回本地 DB 存储后再发布，多了一次 SSH 传输和 marker 解析，没有实质收益
- 简化代码，消除 SSH 脚本生成、marker 解析（`_parse_remote_markers`）、双模式分发等大量代码

**影响**：
- 移除 `_generate_remote()`、`_remote_generate_single()`、`_remote_generate_dual()`、`_parse_remote_markers()`
- `SslCertificateGenerateRequest` 移除 `mode`、`node_id` 参数
- `create_method` 统一为 `local_generate`（不再有 `remote_generate`）

### Decision 4: 新增实用函数和 CA 签发函数

在 `cert_generator.py` 中新增：

```python
def get_cert_expiry(openssl_path: str, cert_pem: str) -> date
    # 解析证书 PEM，通过 openssl x509 -enddate -noout 提取 notAfter

def generate_ca_certificate(openssl_path, common_name, validity_days, flavor) -> tuple[dict, list]
    # 返回 {"ca_cert": ca_pem, "ca_key": ca_pem}

def ca_sign_csr(openssl_path, csr_pem, ca_cert_pem, ca_key_pem, validity_days,
                flavor, extensions_section, ext_file_content) -> tuple[str, list]
    # 用 CA 签发 CSR，返回证书 PEM
```

- `get_cert_expiry()` 被两处使用：`ca_sign_csr()` 中做有效期截断，`publish_ssl_certificate()` 中检查 CA 是否已过期

改造 `generate_dual_certificates()`，移除自签名回退：

```python
def generate_dual_certificates(openssl_path, common_name, dns_sans, ip_sans,
                                validity_days, flavor,
                                ca_cert_pem, ca_key_pem) -> tuple[dict, list]
    # 不再有自签名路径，必须传入 CA 证书+私钥
    # 内部使用 ca_sign_csr() 替代 self_sign_certificate()
```

**理由**：与现有代码结构一致，低耦合。CA 参数不再可选，简化调用方逻辑。

### Decision 5: API 端点分离设计

**CA 生成端点**：`POST /api/v1/clusters/{cluster_id}/ssl/ca`

请求体：
```json
{
  "name": "集群 CA",              // 必填，证书显示名称
  "common_name": "My Cluster CA", // 可选，默认取 name
  "validity_days": 3650          // 可选，默认 3650
}
```

响应：`SslCertificateResponse`（`is_ca=true`，`private_key` 不返回）

**证书生成端点**：`POST /api/v1/clusters/{cluster_id}/ssl/generate`

请求体（仅 SM2 相关字段变化）：
```json
{
  // ... 通用参数（name, common_name, dns_sans, ip_sans, validity_days, algorithm, dual_cert, cert_type）
  "ca_cert_id": 1,               // SM2 必填，引用已有 CA；RSA/ECC 忽略
  "generate_client_certs": false // SM2 可选，是否同时生成客户端双证书
}
```

| 参数 | SM2 | RSA | ECC |
|------|-----|-----|-----|
| `ca_cert_id` | **必填** | 忽略（传了也不报错） | 忽略 |
| `generate_client_certs` | 可选 | 忽略 | 忽略 |

响应体使用独立结构 `SslCertificateGenerateResponse`：
```json
{
  "server": { /* SslCertificateResponse - 服务端证书记录 */ },
  "client": { /* SslCertificateResponse | null - 客户端证书记录 */ }
}
```

- `server` 字段始终有值，包含服务端签名+加密证书
- `client` 字段在 `generate_client_certs=false` 时为 `null`
- 两个子对象都是完整的 `SslCertificateResponse`，各自包含 `ca_cert_id`
- 不污染 DB 模型，职责清晰

**互斥规则简化**：
- SM2 且 `ca_cert_id` 为空 → 400，提示"SM2 证书生成必须指定 CA"
- `ca_cert_id` 对应记录 `is_ca!=true` 或不属于同一集群 → 400
- 不再需要 `generate_ca` vs `ca_cert_id` 互斥校验（因为 CA 有独立端点）

### Decision 6: 扩展文件内联传递

CA 证书使用 `pathlen:0`（不能签发下级 CA），与 non-goals 中"不涉及多级 CA"一致。

CA 签发时需要传递 `keyUsage`、`basicConstraints` 等扩展。为避免依赖外部文件，将扩展配置作为字符串内联传入函数，写入临时文件后传给 `-extfile` 参数（与现有的 `generate_openssl_cnf()` 模式一致）。

### Decision 7: 发布时携带 CA 链

当前发布国密证书时只传 `cert`/`key` + `certs`/`keys`。改造后通过 `ca_cert_id` JOIN 获取 CA 证书 PEM，在发布数据中额外发送 `cert_chain` 字段，内容为 `server_sign.crt + ca.crt` 拼接的 PEM。Edge 节点国密配置中用 `cert_chain` 携带 CA 证书链。不额外存储冗余的 `ca_cert` 字段。

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| 已存在的自签名 SM2 证书在新体系下无法发布 | 系统清空后重新生成，不存在迁移问题 |
| 用户首次使用 SM2 时需要先创建 CA，多一步操作 | 前端自动检测：集群无 CA 时生成对话框引导用户先创建 CA，提供一键跳转 |
| CA 私钥存储在数据库中，存在泄露风险 | CA 私钥 API 默认不返回，需通过单独接口二次确认后获取 |
| 终端证书有效期可能超过 CA 有效期 | 自动截断：`实际有效期 = min(validity_days, CA 剩余有效期)` |
| 移除远程模式影响依赖 SSH 生成的用户 | 远程生成本身的缺陷（无 CA 链）使其在实际部署中不可用，移除是必要的 breaking change |
