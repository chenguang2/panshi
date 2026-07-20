## Context

当前 SM2 国密双证书生成流程（`generate_dual_certificates()`）采用自签名模式——签名证书和加密证书各自用自己生成的密钥对自我签名，不产生也不涉及任何 CA 证书。这种方式在标准 PKI 和国密 TLCP/NTLS 协议中存在问题：

1. **无信任锚点**：双向认证时客户端无法验证服务端证书的合法性，因为不存在可信任的 CA
2. **无法构建证书链**：Edge 网关的国密 SSL 配置期望完整的证书链（Root CA → 终端证书），自签名证书无法形成链
3. **无客户端证书**：ECDHE-SM2-* 套件强制双向认证，但系统当前只能生成服务端证书
4. **扩展缺失**：自签名时未设置 `keyUsage`、`basicConstraints` 等关键扩展字段

## Goals / Non-Goals

**Goals:**

- 新增 CA 根证书生成能力（SM2 密钥对 + 自签名 CA 证书，含 `CA:TRUE`、`keyCertSign`、`cRLSign`）
- 新增 CA 签发函数，支持用 CA 证书+私钥签署 CSR
- 改造 `generate_dual_certificates()`，支持由 CA 签发替代自签名（向后兼容，不传 CA 时保持自签名）
- 新增客户端双证书生成能力（由指定 CA 签发）
- 新增一次性生成完整链的能力（CA + 服务端双证 + 客户端双证）
- DB 模型增加 `ca_cert` 字段存储签发 CA 的证书内容，同时支持 CA 证书的存储
- 发布到 Edge 时携带 CA 证书链
- 前端生成对话框增加 CA/客户端证书生成选项及生成后下载入口

**Non-Goals:**

- 不涉及多级 CA（仅 Root CA → 终端证书，不引入 Sub CA 层级）
- 不涉及证书吊销（CRL/OCSP）
- 不改动 RSA/ECDSA 证书生成流程
- 不涉及 CA 证书的独立管理页面（CA 作为 SSL 证书记录的一种类型，而非独立管理入口）

## Decisions

### Decision 1: CA 作为 SSL 证书记录的 subtype

**方案**：`SslCertificate` 表新增 `is_ca`（Boolean）和 `ca_cert_id`（FK → `ps_ssl_certificate.id`）字段，CA 证书本身是一条 `SslCertificate` 记录（`is_ca=true`，`ca_cert_id=null`）。被 CA 签发的普通证书通过 `ca_cert_id` 外键引用 CA 记录，不加冗余的 `ca_cert` 字段，发布时通过 JOIN 获取 CA 证书内容。

| 记录类型 | `is_ca` | `ca_cert_id` | `ca_cert` 冗余字段 |
|----------|---------|-------------|-------------------|
| CA 证书 | `true` | `null` | 不加 |
| CA 签发的终端证书 | `false` | CA 记录 id | 不加 |
| 自签名证书（旧模式） | `false` | `null` | 不加 |

**理由**：
- 复用现有 SSL 证书的完整基础设施（列表、版本、对比）
- 避免数据冗余和一致性问题
- CA 私钥通过单独接口获取，API 默认不返回

**约束**：
- 删除 CA 时，如果存在 `ca_cert_id` 指向该 CA 的记录，禁止删除（硬限制）
- 同一集群允许存在多个 CA，生成时若有已有 CA 则给出软提示
- 客户端证书（`cert_type=client`）前后端双重阻止发布操作

### Decision 2: 新增 `ca_signed_certificate()` 函数

在 `cert_generator.py` 中新增：
```python
def generate_ca_certificate(openssl_path, common_name, validity_days, flavor) -> tuple[dict, list]
    # 返回 {"ca_cert": ca_pem, "ca_key": ca_pem}

def ca_sign_csr(openssl_path, csr_pem, ca_cert_pem, ca_key_pem, validity_days,
                flavor, extensions_section, ext_file_content) -> tuple[str, list]
    # 用 CA 签发 CSR，返回证书 PEM

def generate_dual_certificates_signed(...) → 在现有函数基础上增加可选 ca_* 参数
```

**理由**：与现有代码结构一致，低耦合。`generate_dual_certificates()` 签名不破坏向后兼容。

### Decision 3: 生成完整链的 API 设计

`SslCertificateGenerateRequest` 新增字段：
```python
generate_ca: bool = False             # 是否同时生成 CA
generate_client_certs: bool = False   # 是否同时生成客户端证书
ca_cert_id: int | None = None         # 引用已有 CA 签发
validity_days_ca: int = 3650          # CA 有效期（仅 generate_ca=true 时）
```

参数互斥规则：
- `ca_cert_id` 和 `generate_ca=true` **互斥**，同时指定返回 422
- `ca_cert_id` 必须指向同一集群下 `is_ca=true` 的记录
- 终端证书有效期自动截断，不超过 CA 有效期

当 `generate_ca=True` 时，`_generate_local()` 和 `_generate_remote()` 返回三条记录：
```python
{
  "ca": {"id": 1, ...},          # CA 证书记录
  "server": {"id": 2, ...},      # 服务端证书记录
  "client": {"id": 3, ...},      # 客户端证书记录（可选）
}
```

前端根据 `generate_ca`/`generate_client_certs` 显示对应的下载入口。

### Decision 4: 扩展文件内联传递和 CA 证书扩展

CA 证书使用 `pathlen:0`（不能签发下级 CA），与 non-goals 中"不涉及多级 CA"一致。

CA 签发时需要传递 `keyUsage`、`basicConstraints` 等扩展。为避免依赖外部文件，将扩展配置作为字符串内联传入函数，写入临时文件后传给 `-extfile` 参数（与现有的 `generate_openssl_cnf()` 模式一致）。

CA 签发时需要传递 `keyUsage`、`basicConstraints` 等扩展。为避免依赖外部文件，将扩展配置作为字符串内联传入函数，写入临时文件后传给 `-extfile` 参数（与现有的 `generate_openssl_cnf()` 模式一致）。

### Decision 5: 发布时携带 CA 链

当前发布国密证书时只传 `cert`/`key` + `certs`/`keys`。改造后通过 `ca_cert_id` JOIN 获取 CA 证书 PEM，在发布数据中额外发送 `cert_chain` 字段，内容为 `server_sign.crt + ca.crt` 拼接的 PEM。Edge 节点国密配置中用 `cert_chain` 携带 CA 证书链。不额外存储冗余的 `ca_cert` 字段。

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| 现有自签名证书用户升级后不兼容 | 保持向后兼容：不传 `ca_*` 参数时行为不变 |
| CA 私钥存储在数据库中，存在泄露风险 | CA 私钥 API 默认不返回，需通过单独接口二次确认后获取 |
| 生成完整链耗时增加（3x openssl 调用） | 异步生成或前端显示更详细的进度 |
| 终端证书有效期可能超过 CA 有效期 | 自动截断：`实际有效期 = min(validity_days, CA 剩余有效期)` |
| 前端对话框选项增多导致 UX 复杂 | 默认折叠高级选项，默认 behavior 保持原来自签名模式不变 |
