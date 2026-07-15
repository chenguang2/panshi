## Why

SSL 证书列表页加载失败（"加载 SSL 证书失败"），原因是后端 Pydantic Response schema 对 `cert` 和 `private_key` 字段设置了 `min_length=1` 约束，但数据库中存在导入的空值记录，导致 `model_validate` 校验失败。

同时搜索框样式过长、独占一行，与其他页面（如四层代理）固定宽度搜索框风格不一致。

## What Changes

1. **修复 SSL 证书列表加载失败**：`SslCertificateBase` 中 `cert` 和 `private_key` 字段移除 `min_length=1` 约束，设为可选默认为空字符串。`SslCertificateCreate` 单独保留 `min_length=1` 约束确保创建时必填。
2. **修复搜索框样式**：将 `.ssl-header-actions` 中搜索框从 `flex: 1` 改为固定宽度 `200px`，与其他页面风格一致。

## Capabilities

### New Capabilities
- _(无)_

### Modified Capabilities
- `ssl-certificate-management`: 修复列表加载失败问题；搜索框样式统一

## Impact

- **后端**: `app/schemas/ssl.py` — 调整 `cert` 和 `private_key` 字段约束
- **前端**: `frontend/src/views/SslList.vue` — 搜索框 CSS 样式调整
