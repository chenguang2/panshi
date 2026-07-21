## 1. 数据库迁移

- [x] 1.1 `models/ssl.py`: 在 `SslCertificate` 类中新增 `client_ca`（Text, nullable）、`client_depth`（Integer, nullable, default=1）、`skip_mtls_uri_regex`（Text, nullable）字段
- [x] 1.2 在 `backend/app/core/migrate.py` 中添加迁移逻辑，为新字段加 ALTER TABLE

## 2. 后端 Schema

- [x] 2.1 `schemas/ssl.py`: `SslCertificateBase` 新增 `client_ca: Optional[str]`、`client_depth: Optional[int]`、`skip_mtls_uri_regex: Optional[str]` 字段
- [x] 2.2 `schemas/ssl.py`: `SslCertificateGenerateRequest` 新增可选 mTLS 字段
- [x] 2.3 `schemas/ssl.py`: `SslCertificateCreate` 新增可选 mTLS 字段
- [x] 2.4 `schemas/ssl.py`: `SslCertificateUpdate` 新增可选 mTLS 字段

## 3. 后端清理逻辑

- [x] 3.1 `api/v1/cluster_ssl.py`: 在 `update_ssl_certificate()` 中，当 `gm` 从 true 变为 false 时，清空 `client_ca`、`client_depth`、`skip_mtls_uri_regex`

## 4. 发布逻辑

- [x] 4.1 `api/v1/cluster_ssl.py`: 在 `publish_ssl_certificate()` 中，于 `config_data` 拼装完成后，检查 `cert.client_ca` 是否非空且 `cert.gm=true`，若满足则组装 `client` 对象（`ca`、`depth`、`skip_mtls_uri_regex`）加入 `config_data`

## 4. Edge 导入

- [x] 4.1 `services/edge_import_service.py`: 在 `convert_ssl_certificate()` 中解析 `raw_data.get("client", {})`，提取 `ca`、`depth`、`skip_mtls_uri_regex` 并写入返回的 dict

## 5. 配置对比

- [x] 5.1 `api/v1/cluster_nodes.py`: 在 `_compare_ssl_certificate()` 中增加 `client_ca`、`client_depth`、`skip_mtls_uri_regex` 三个字段的对比逻辑，分别对应 Edge 端的 `client.ca`、`client.depth`、`client.skip_mtls_uri_regex`

## 6. 前端类型

- [x] 6.1 `types/ssl.ts`: `SslCertificate` 接口新增 `client_ca?: string`、`client_depth?: number`、`skip_mtls_uri_regex?: string`
- [x] 6.2 `types/ssl.ts`: `SslCertificateGenerateRequest`、`SslCertificateCreate`、`SslCertificateUpdate` 接口新增对应可选字段

## 7. 前端上传/编辑表单

- [x] 7.1 `SslFormDrawer.vue`: 在表单底部新增可折叠的"双向认证 (mTLS)"区域（使用自定义折叠组件），仅 `gm=true` 且 `cert_type=server` 时显示
- [x] 7.2 `SslFormDrawer.vue`: mTLS 区域包含 `client_ca`（Textarea，PEM 粘贴）、`client_depth`（数字输入，默认 1）、`skip_mtls_uri_regex`（列表输入，独立输入框 + "添加"按钮，每行一条正则，右侧删除按钮）
- [x] 7.3 `SslFormDrawer.vue`: 编辑模式时回填 mTLS 数据（`skip_mtls_uri_regex` 从 JSON 解析为列表）
- [x] 7.4 `SslFormDrawer.vue`: 证书类型切换为 `client` 或取消国密时隐藏 mTLS 区域，满足条件时重新显示

## 8. 前端生成对话框

- [x] 8.1 `SslGenerateDialog.vue`: 新增可折叠的"双向认证 (mTLS)"区域，SM2+server 类型时始终显示，默认折叠
- [x] 8.2 `SslGenerateDialog.vue`: mTLS 区域包含 `client_ca`（Textarea）、`client_depth`（数字输入，默认1）、`skip_mtls_uri_regex`（列表输入，每行一条正则）
- [x] 8.3 `SslGenerateDialog.vue`: 勾选"同时生成客户端证书"且 `client_ca` 为空时自动填入当前 CA 的 PEM
- [x] 8.4 `api/ssl.ts`: 生成请求中携带 mTLS 字段（通过类型系统已支持）

## 9. 前端查看弹窗

- [x] 9.1 `SslViewDrawer.vue`: 在有 mTLS 配置时展示"双向认证：已启用"标记
- [x] 9.2 `SslViewDrawer.vue`: 展开显示 `client_ca`、`client_depth`、`skip_mtls_uri_regex` 详情
