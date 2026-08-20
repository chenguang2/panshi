## Why

生成证书的 IP SAN 输入框未做 IP 格式校验，用户可输入任意字符串（如 `abc`、`999`）。非 IP 值会被直接写入证书的 `IP:` subjectAltName，导致 openssl 生成失败或产生无效 SAN。前端 `SslGenerateDialog.vue` 的 `addIpTag()` 只做拆分去重，后端 schema 与 `_build_san_args()` 也均无校验。

## What Changes

- 前端 `SslGenerateDialog.vue`：IP SAN 输入添加格式校验（IPv4 + IPv6），非法输入拒绝加入并提示。
- 后端 `SslCertificateGenerateRequest.ip_sans`：添加 `field_validator` 校验 IP 格式，非法 IP 返回 422（兜底，防绕过前端）。

## Capabilities

### New Capabilities
<!-- 无新能力引入 -->

### Modified Capabilities
- `ssl-certificate-generation`: IP SAN 输入必须为合法 IPv4/IPv6，前后端均校验。

## Impact

- **后端**：`backend/app/schemas/ssl.py`（`SslCertificateGenerateRequest.ip_sans` 加 validator）。
- **前端**：`frontend/src/components/SslGenerateDialog.vue`（`addIpTag` 加 IP 校验，复用 `SslFormDrawer.vue` 的 `isIpAddress` 逻辑）。
- **测试**：新增后端 schema IP 校验单测、前端 IP 输入单测。
