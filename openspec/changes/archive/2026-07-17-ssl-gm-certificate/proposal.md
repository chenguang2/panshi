## Why

当前系统仅支持单证书（cert + key）的 SSL 证书管理。部分部署环境要求使用国密（NTLS/TLCP）双证书协议，需要加密证书 + 签名证书两对密钥。Edge 侧已有国密支持（`gm: true` 标记 + `certs/keys` 签名证书字段），磐石 Admin 需要补齐前端录入和后端发布能力。

## What Changes

1. **数据库模型扩展** — `SslCertificate` 新增 `gm`（boolean）、`sign_cert`（签名证书文本）、`sign_key`（签名私钥文本）三个字段
2. **SSL 表单扩展** — 新增"国密双证书"开关，打开后展示签名证书/签名私钥上传字段
3. **SSL 详情展示** — 卡片和详情中显示国密标识及签名证书信息
4. **Edge 发布适配** — `gm=true` 时组装双证书格式（`cert/key` + `certs/keys`）发送到 Edge

## Capabilities

### New Capabilities
- （无，国密双证书作为 ssl-certificate-management 的能力扩展）

### Modified Capabilities
- `ssl-certificate-management`: 新增国密双证书支持（表单、模型、发布）

## Impact
- `backend/app/models/ssl.py` — 新增 `gm`, `sign_cert`, `sign_key` 字段
- `backend/app/schemas/ssl.py` — Schema 新增对应字段
- `backend/app/api/v1/cluster_ssl.py` — 发布时判断 `gm` 组装双证书格式
- `frontend/src/types/ssl.ts` — 类型新增字段
- `frontend/src/components/SslFormDrawer.vue` — 新增国密开关 + 签名证书上传
- `frontend/src/views/SslList.vue` — 详情展示国密标识
