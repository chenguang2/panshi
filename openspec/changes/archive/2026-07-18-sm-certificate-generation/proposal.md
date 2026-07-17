## Why

磐石Admin 管理的 Edge 网关集群已支持国密（SM2/SM3/SM4）SSL 证书，OpenResty 已集成 Tongsuo/BabaSSL。但目前平台仅支持手动上传/粘贴证书 PEM 文件，缺乏国密证书的 **自动生成** 能力。

运维人员需要在 Edge 网关上使用国密双证书（加密证书+签名证书），目前只能通过外部工具生成后再上传，流程繁琐且容易出错。本功能让用户直接在平台内完成 SM2 密钥对生成、自签名证书签发，并自动填充到 SSL 证书管理的国密字段中，实现端到端的国密证书生命周期管理。

## What Changes

- **新增后端 SM2 证书生成服务** — 使用项目预置的 Tongsuo openssl 二进制（本地生成），或通过 SSH 连接集群节点使用 `openresty/bin/openssl`（远程生成），两种方式均支持 SM2 密钥对生成和自签名证书签发
- **新增数据库字段 `create_method`** — 记录证书创建方式：`upload` / `local_generate` / `remote_generate`，用于前端标识证书来源
- **新增 API 端点 `POST /clusters/{cluster_id}/ssl/generate`** — 接收生成参数（CN、域名 SAN、IP SAN、有效期、双证书模式、生成方式、远程节点 ID 等），生成证书并自动保存为 SslCertificate 记录（`gm=True`）
- **新增前端"生成国密证书"对话框** — 在 SSL 证书管理页面添加对话框，可选本地生成或远程生成，填写证书参数后一键生成并保存
- **复用现有 SSL 证书管理基础设施** — 生成的证书自动进入现有的发布/版本历史/回滚/配置比对流程，无需额外修改
- **支持双证书模式** — 同时生成加密证书（cert+private_key）和签名证书（sign_cert+sign_key），符合国密 GM/T 0024 规范

## Capabilities

### New Capabilities
- `ssl-certificate-generation`: SM2 国密证书自动生成，包括密钥对生成、自签名证书签发，支持本地 Tongsuo openssl 和 SSH 远程两种生成方式，支持双证书（加密+签名）模式

### Modified Capabilities
- `ssl-certificate-management`: SSL 证书管理模块增加"生成国密证书"入口；SSL 证书记录增加 `create_method` 字段标识来源；证书列表页区分"手动上传"和"国密生成"

## Impact

- **后端新增文件**:
  - `backend/app/services/cert_generator.py` — SM2 证书生成服务（本地 Tongsuo subprocess + SSH 远程）
- **后端修改文件**:
  - `backend/app/api/v1/cluster_ssl.py` — 新增 `POST /generate` 端点
  - `backend/app/schemas/ssl.py` — 新增证书生成请求/响应 Schema，`create_method` 字段
  - `backend/app/models/ssl.py` — 新增 `create_method` 列
  - `backend/app/core/migrate.py` — 新增 `create_method` 迁移
- **前端新增/修改文件**:
  - `frontend/src/components/SslGenerateDialog.vue` — 新增国密证书生成对话框
  - `frontend/src/api/ssl.ts` — 新增生成 API 调用
  - `frontend/src/types/ssl.ts` — 新增生成参数和 `create_method` 类型
  - `frontend/src/views/SslList.vue` — 添加"生成国密证书"按钮，证书卡片显示来源标识
- **资产新增**: `product/linux/tongsuo/bin/openssl` — Tongsuo 8.5.0-pre1 静态 openssl 二进制（7MB），供本地生成使用
- **部署变更**: `product/linux/gen-linux.sh` 增加拷贝 Tongsuo openssl 到 `backend/bin/` 的步骤
