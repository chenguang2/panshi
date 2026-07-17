## Context

当前 SSL 证书系统仅支持单证书（`cert` + `key`）。Edge 侧 Admin API 已支持国密 NTLS/TLCP 双证书格式（`cert`/`key` 加密 + `certs[]`/`keys[]` 签名 + `gm: true`），磐石 Admin 需要补齐从录入到发布的完整链路。

## Goals / Non-Goals

**Goals:**
- 数据库支持存储国密双证书（加密证书 + 签名证书）
- 前端表单支持录入国密双证书（开关切换 + 额外字段）
- 发布到 Edge 时根据 `gm` 标记发送正确格式
- 历史证书数据不受影响（`gm` 默认 false）

**Non-Goals:**
- 不修改 EdgeClient 通用 API 方法
- 不修改 SSL 列表页面的整体布局
- 不涉及自动化证书签发

## Decisions

### 1. 数据模型扩展

在 `SslCertificate` 中新增三个字段：

```python
gm = Column(Boolean, default=False)          # 是否国密双证书
sign_cert = Column(Text, nullable=True)      # 签名证书 PEM
sign_key = Column(Text, nullable=True)       # 签名私钥 PEM
```

### 2. 前端表单布局

`SslFormDrawer.vue` 中 cert 字段下方新增开关：

```
☐ 国密双证书 (gm)
  ┌─ 签名证书 (sign_cert)  [上传] [粘贴]    ← gm=true 时显示
  └─ 签名私钥 (sign_key)   [上传] [粘贴]    ← gm=true 时显示
```

验证逻辑：`gm=true` 时 `sign_cert` 和 `sign_key` 为必填。

### 3. Edge 发布格式

`cluster_ssl.py` 中 `publish_ssl_certificate` 函数修改：

```python
config_data = {"cert": cert.cert, "key": cert.private_key, "type": cert.cert_type}
if cert.gm:
    config_data["certs"] = [cert.sign_cert]
    config_data["keys"] = [cert.sign_key]
    config_data["gm"] = True
```

## Risks / Trade-offs

- [低] 数据库 migration — 新增字段均为 nullable，已有数据不受影响
