## Context

SSL 证书查看界面（`SslViewDrawer.vue`）目前以 `a-descriptions` 展示证书元信息，然后以 `<pre>` 标签展示 PEM 全文。用户只能手动复制 PEM 文本，无法直接下载为文件。

后端 API 已返回完整 PEM 内容，无需新增接口。

## Goals / Non-Goals

**Goals:**
- 在 SslViewDrawer 每个 PEM 区域添加下载按钮
- 点击后浏览器下载对应 `.pem` / `.key` 文件
- 文件名包含证书名称，便于识别（如 `my-cert_cert.pem`、`my-cert_key.pem`）
- 双证书时提供全部四个文件的下载
- 生成成功后 toast 通知增加"下载"入口

**Non-Goals:**
- 不在卡片上直接加下载按钮（已有足够按钮）
- 不在编辑界面加下载（编辑和下载意图不同）
- 不需要后端变更

## Decisions

### 决策 1: 下载实现方式 — Blob + URL.createObjectURL

使用浏览器原生 API 实现下载，无需额外库：

```typescript
function downloadPem(content: string, filename: string) {
  const blob = new Blob([content], { type: 'application/x-pem-file' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
```

### 决策 2: 文件名规则

```
{证书名称}_{类型}.pem
```

| 内容 | 文件名 |
|---|---|
| 证书 cert | `my-cert_cert.pem` |
| 私钥 key | `my-cert_key.pem` |
| 签名证书 sign_cert | `my-cert_sign_cert.pem` |
| 签名私钥 sign_key | `my-cert_sign_key.pem` |

### 决策 3: 按钮位置

每个 PEM 区域的标题行右侧放一个下载按钮（图标+文字），保持视觉一致。

## UI 设计

```
┌─ 查看 SSL 证书 ──────────────────────────┐
│                                            │
│  ── 证书内容 (PEM) ──────────── [📥 下载] │
│  ┌────────────────────────────────────────┐│
│  │ -----BEGIN CERTIFICATE-----            ││
│  │ ...                                    ││
│  │ -----END CERTIFICATE-----              ││
│  └────────────────────────────────────────┘│
│                                            │
│  ── 私钥内容 (PEM) ──────────── [📥 下载] │
│  ┌────────────────────────────────────────┐│
│  │ -----BEGIN PRIVATE KEY-----            ││
│  │ ...                                    ││
│  │ -----END PRIVATE KEY-----              ││
│  └────────────────────────────────────────┘│
│                                            │
│  ── 签名证书 (sign_cert) ──── [📥 下载]   │  ← 双证书
│  ┌────────────────────────────────────────┐│
│  │ -----BEGIN CERTIFICATE-----            ││
│  │ ...                                    ││
│  │ -----END CERTIFICATE-----              ││
│  └────────────────────────────────────────┘│
│                                            │
│  ── 签名私钥 (sign_key) ──── [📥 下载]    │  ← 双证书
│  ┌────────────────────────────────────────┐│
│  │ -----BEGIN PRIVATE KEY-----            ││
│  │ ...                                    ││
│  │ -----END PRIVATE KEY-----              ││
│  └────────────────────────────────────────┘│
│                                            │
└────────────────────────────────────────────┘
```

### 决策 4: 生成成功后的下载入口

`SslGenerateDialog` 生成成功后 emit `success` 时携带证书完整数据（含 id）。父组件 `SslList.vue` 在 toast 中增加"下载证书"操作，点击后直接打开该证书的查看弹窗（复用已有的 `viewCert` / `viewDrawerVisible` 逻辑）。

```typescript
// SslGenerateDialog emit
emit('success', certResponse)  // certResponse 是 API 返回的完整证书对象

// SslList.vue 处理
function onGenerateSuccess(cert: any) {
  generateVisible.value = false
  loadCerts()
  message.success({
    content: '国密证书生成成功',
    onClick: () => viewCert(cert),  // 点击 toast 打开查看弹窗
  })
}
```

## Risks / Trade-offs

无显著风险。纯前端功能，不涉及后端和数据变更。
