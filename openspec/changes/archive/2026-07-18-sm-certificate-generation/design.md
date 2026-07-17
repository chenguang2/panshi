## Context

磐石Admin 已完整支持 SSL 证书管理（CRUD、发布、版本历史、回滚、配置比对），数据库模型 `ps_ssl_certificate` 已有国密字段（`gm`、`sign_cert`、`sign_key`）。目前所有证书均需通过上传 PEM 文件或粘贴文本的方式手动录入。

通过实验验证：
- **系统本地 OpenSSL 3.5.5** 已原生支持 SM2 曲线
- **项目预置的 Tongsuo 8.5.0-pre1 openssl** 静态二进制（strip 后 7MB）完整支持 SM2 证书生成
- 证书签名算法为 `SM2-with-SM3`，公钥 OID 为 `SM2`

Edge 网关集群节点上部署的 OpenResty 集成了 Tongsuo/BabaSSL，可通过 SSH 远程执行作为备选方案。

## Goals / Non-Goals

**Goals:**
- 用户可通过平台 UI 选择本地生成或远程生成 SM2 国密证书（单证书或双证书模式）
- 生成的证书自动保存为 `SslCertificate` 记录（`gm=True`），填充所有国密字段
- 记录证书创建方式（`create_method`），前端展示来源标识
- 复用以发布/版本历史/回滚/配置比对为核心的现有 SSL 基础设施
- 支持自定义证书参数：CN、域名 SAN、IP SAN、有效期
- 支持自签名证书（无 CA 链），满足测试和生产场景

**Non-Goals:**
- 不实现完整的 PKI/CA 管理系统（根 CA、中间 CA、证书吊销列表 CRL）
- 不替代或移除现有手动上传/粘贴证书功能
- 不涉及国际算法（RSA/ECDSA）证书的生成
- 不涉及证书自动续期或到期提醒（可后续迭代）
- 不支持 CSR 下载模式（生成 CSR 提交外部 CA 签名后再导入，后续迭代）

## Decisions

### 决策 1: 证书生成方式 — 本地优先 + 用户可选远程

**本地生成**采用项目预置的 Tongsuo 8.5.0-pre1 openssl 二进制，存储在 `product/linux/tongsuo/bin/openssl`。
部署时 `gen-linux.sh` 将其拷贝到 `backend/bin/openssl`。

用户在对话框中可选"本地生成"或"远程生成"：

```
证书生成流程：
1. 用户在对话框中选择生成方式
2. [本地] → 检测 backend/bin/openssl（Tongsuo）→ 本地 subprocess → 返回 PEM
3. [本地，无 Tongsuo] → 检测系统 PATH openssl → 支持 SM2？→ subprocess → 返回 PEM
4. [远程] → SSH 连接到用户指定的集群节点 → 远程 openssl → 返回 PEM
5. [均不可用] → 返回错误信息
```

### 决策 2: `-sigopt` 参数的版本适配

根据实际 openssl 的发行版决定是否加 `-sigopt "sm2_id:1234567812345678"` 参数：

| openssl 来源 | 检测依据 | 加 `-sigopt` |
|---|---|---|
| bundled Tongsuo | 路径为 `backend/bin/openssl` + version 输出含 "Tongsuo" | ✅ 加 |
| 系统 PATH 中的 Tongsuo/BabaSSL | `openssl version` 输出含 "Tongsuo" 或 "BabaSSL" | ✅ 加 |
| 系统 PATH 中的标准 OpenSSL 3.x | `openssl version` 输出含 "OpenSSL" 不含 "Tongsuo"/"BabaSSL" | ❌ 不加 |
| SSH 远程 Tongsuo/BabaSSL | 远程 `openssl version` 输出含 "Tongsuo" 或 "BabaSSL" | ✅ 加 |

`sigopt` 的值 `"sm2_id:1234567812345678"` 写死在代码中。

### 决策 3: 证书签名模式

- **默认模式**：自签名双证书（同时生成加密和签名两套密钥和证书），共用同一组 CN 和 SAN
- **简单模式**：单证书（`dual_cert=false`），`gm=True`，仅填充 `cert` + `key`
- 不支持 CSR 下载模式

### 决策 4: 对话框集成集群/节点选择

生成入口放在 SSL 证书管理页面（`SslList.vue`）顶部操作栏的"生成国密证书"按钮。

对话框包含生成方式选择：
- **本地生成**：使用本服务器 Tongsuo openssl，需选择所属集群（下拉框）
- **远程生成**：通过 SSH 连接到集群节点，需选择集群→节点

**理由：**
1. SSL 证书管理已是一个独立页面（路由 `/ssl`），按集群分组展示
2. 生成是 SSL 证书创建的补充方式，与"新建"按钮并列
3. 对话框内选择集群和节点，不新增页面或标签

### 决策 5: 远程 SSH 凭据获取

远程生成时，`cert_generator.py` 直接复用现有 `backend/app/services/ansible_service.py` 的 SSH 抽象层：

```python
from app.services.ansible_service import (
    get_ssh_user,           # get_ssh_user(ip) → "jboss"
    get_ssh_password,       # get_ssh_password(ip) → "jboss@12306"
    _run_ssh_with_fallback, # (rc, stdout, stderr)
)
```

认证方式与 Ansible 一致：优先 SSH key（`~/.ssh/id_rsa`），失败则通过 `sshpass` 回退到密码认证。无需新增 Python 依赖。

凭据源为 `backend/ansible/inventory/host`（YAML 格式），按节点 IP 匹配。Node 模型不存储 SSH 凭据，仅通过 `Node.ip` 在 inventory 中查找。

### 决策 6: 证书保存方式

生成后的 PEM 内容直接通过 API 保存为 `SslCertificate` 记录：

| 字段 | 值 |
|---|---|
| `cert` | 加密证书 PEM |
| `key` | 加密私钥 PEM |
| `sign_cert` | 签名证书 PEM（双证书模式） |
| `sign_key` | 签名私钥 PEM（双证书模式） |
| `gm` | `true` |
| `create_method` | `local_generate` 或 `remote_generate` |
| `name` | 用户指定的证书名称 |
| `sni` | 用户指定的域名 SAN 列表（CSV） |
| `cert_type` | `server`（默认） |

现有的 `publish`、`rollback`、`history`、`diff` 流程完全复用，无需修改。

### 决策 7: 证书创建方式追踪

在 `ps_ssl_certificate` 表新增 `create_method` 列，枚举值：
- `upload` — 手动上传/粘贴（存量证书默认值）
- `local_generate` — 本地 Tongsuo 生成
- `remote_generate` — SSH 远程节点生成

前端根据 `create_method` 显示对应的来源标识。

## 数据库变更

```python
# ps_ssl_certificate 表新增字段
create_method = Column(String(32), default="upload", nullable=False)
# 索引可选，用于后续可能按来源筛选
```

## API 设计

### 请求: `POST /api/v1/clusters/{cluster_id}/ssl/generate`

```json
{
  "name": "my-sm2-cert",
  "common_name": "example.com",
  "dns_sans": ["example.com", "www.example.com"],
  "ip_sans": ["10.0.0.1"],
  "validity_days": 3650,
  "dual_cert": true,
  "cert_type": "server",
  "mode": "local",
  "node_id": null
}
```

参数说明：
- `mode`: `"local"` | `"remote"`，必填
- `node_id`: 远程生成时必填，指定执行节点
- `dns_sans` / `ip_sans`: 后端自动格式化为 `DNS:` / `IP:` 前缀

### 响应: `SslCertificateResponse`（HTTP 201）

标准 SSL 证书响应，含 `create_method` 字段。

## UI 设计

### 国密证书生成对话框 (`SslGenerateDialog.vue`)

```
┌─────────────────────────────────────────────────────┐
│  生成国密证书                                   ✕   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  生成方式    [● 本地生成  ○ 远程生成]                │
│                                                     │
│  所属集群    [集群A                     ▼]          │
│  ── 远程时额外显示 ──                               │
│  执行节点    [节点1 (10.0.0.1)          ▼]          │
│                                                     │
│  证书名称 *  [________________________]             │
│  通用名称 *  [________________________]             │
│                                                     │
│  域名 SAN    [______________]  [+]                  │
│              example.com  www.example.com           │
│                                                     │
│  IP SAN      [______________]  [+]                  │
│              10.0.0.1                               │
│                                                     │
│  有效期      [3650] 天                              │
│  双证书模式  [✅ 同时生成加密证书和签名证书]         │
│  证书类型    [server                    ▼]           │
│                                                     │
│              [取消]              [生成并保存]        │
└─────────────────────────────────────────────────────┘
```

### 生成中状态

```
┌─────────────────────────────────────────────────────┐
│  正在生成国密证书...                            ✕   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ⏳ 生成 SM2 密钥对...                               │
│  ⏳ 生成 CSR...                                      │
│  ⏳ 签发证书...                                      │
│  ⏳ 保存证书记录...                                   │
│                                                     │
│              [生成中，请不要关闭]                     │
└─────────────────────────────────────────────────────┘
```

### 生成成功

自动关闭对话框，SSL 列表刷新，新证书卡片显示"国密生成"标识。

## 关键命令链

### Tongsuo openssl（bundled + 远程共用）

```bash
# 1. 生成 SM2 密钥对
openssl ecparam -genkey -name SM2 -out sm2.key

# 2. 创建最小 openssl.cnf
cat > openssl.cnf << 'CONF'
[ req ]
distinguished_name = req_distinguished_name
string_mask = utf8only
default_md = sm3
prompt = no
[ req_distinguished_name ]
commonName = <common_name>
CONF

# 3. 生成 CSR（Tongsuo 需带 -config）
openssl req -new -key sm2.key -out sm2.csr -sm3 \
  -subj "/CN=<common_name>" \
  -config openssl.cnf -nodes \
  -sigopt "sm2_id:1234567812345678" \
  -addext "subjectAltName=DNS:example.com,IP:10.0.0.1"

# 4. 自签名证书（Tongsuo 需带 -sigopt）
openssl x509 -req -in sm2.csr -signkey sm2.key -out sm2.crt \
  -sm3 -days 365 -sigopt "sm2_id:1234567812345678"
```

### 标准 OpenSSL 3.x（系统 PATH）

```bash
# 1. 生成 SM2 密钥对
openssl ecparam -genkey -name SM2 -out sm2.key

# 2. 生成 CSR（无需 -config，无需 -sigopt）
openssl req -new -key sm2.key -out sm2.csr -sm3 \
  -subj "/CN=<common_name>" -nodes \
  -addext "subjectAltName=DNS:example.com,IP:10.0.0.1"

# 3. 自签名证书（无需 -sigopt）
openssl x509 -req -in sm2.csr -signkey sm2.key -out sm2.crt \
  -sm3 -days 365
```

## Risks / Trade-offs

| 风险 | 缓解措施 |
|---|---|
| **本地 openssl 不支持 SM2**：部署环境的 OpenSSL 版本过低（< 3.0）或系统无 openssl | bundled Tongsuo 优先使用；如被删除则降级到 SSH 远程生成 |
| **SSH 连接失败**：用户选择了远程模式但节点不可达 | 对话框在提交前测试连接；失败时返回明确错误 |
| **Tongsuo 参数差异**：不同 Tongsuo 版本对 `-sigopt` 的支持可能不同 | 在 `detect_openssl()` 中统一检测版本，按已知模式适配 |
| **临时文件残留**：key/csr/crt 文件泄露私钥 | 使用 `tempfile.mkdtemp()`，`finally` 块中递归清理 |
| **并发生成冲突**：多个用户同时生成 | 每次操作独立临时目录（`mkdtemp()` 保证唯一性） |

## Open Questions

1. 是否需将 openssl 路径设为可配置环境变量，适应 Docker 等特殊部署？（暂不处理）
