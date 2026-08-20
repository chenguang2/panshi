## Why

Edge 网关节点默认使用 `edge.local` 作为内部管理/健康检查的访问域名。实际运行中，客户端（如 `192.168.0.103`）以 `SNI=edge.local` 访问网关 `16610` 端口时，因生成证书的 SAN 未包含 `edge.local`，nginx 报 `failed to match any SSL certificate by SNI: edge.local`，导致管理链路/健康检查握手失败。因此需要在生成证书时**默认**将 `edge.local` 写入证书 SAN，保证平台自身管理链路不报警。

## What Changes

- 生成 SSL 证书（`dns_sans`）时，系统**强制**将 `edge.local` 域名合并进**服务端证书**的 DNS SAN，用户无需（也不能）移除。
- **仅服务端证书注入**：客户端证书（SM2 客户端双证书 / `cert_type=client`）不强制注入，保留用户原始 SAN，避免无功能收益的污染。
- `edge.local` 作为**系统保留域名**：前端生成对话框默认展示且**不可删除**（锁定样式），后端生成接口**兜底合并**（即使绕过前端也生效）。
- **更新/回滚路径同样强制保留**：编辑接口（`PUT /ssl/{id}`）更新 server 证书的 `sni` 字段、以及回滚到历史版本时，后端都强制合并 `edge.local`，防止绕过生成路径破坏不变量。
- 域名比较**大小写不敏感**：`EDGE.LOCAL` / `Edge.Local` 与 `edge.local` 视为同一项，前后端统一归一为小写后去重。
- 证书 SAN 列表在编辑查看、列表展示时对 `edge.local` 明确标注"系统保留"。
- **导入路径不强制**：添加已有证书时不注入 `edge.local`（用户自担），但前端对 server 类型证书给出提示建议包含该域名。
- 允许"仅 `edge.local`"（无其他 SAN）的证书——这正是管理证书的典型场景。

## Capabilities

### New Capabilities
<!-- 无新能力引入 -->

### Modified Capabilities
- `ssl-certificate-generation`: 生成/更新/回滚 server 证书时强制合并系统保留域名 `edge.local` 到 DNS SAN / `sni` 字段，且不可被用户移除；客户端证书不注入。

## Impact

- **后端**：`backend/app/api/v1/cluster_ssl.py` 的 `_generate_local`（服务端证书生成时合并 `dns_sans`）；`update_ssl_certificate`（更新 `sni` 时对 server 证书强制合并）；`rollback_ssl_certificate`（回滚 `sni` 时对 server 证书强制合并）。`cert_generator.py` 底层工具函数不修改。
- **前端**：`frontend/src/components/SslGenerateDialog.vue`（生成对话框预置锁定 `edge.local` chip）；`frontend/src/components/SslFormDrawer.vue`（编辑查看时标注系统保留域名 + 导入模式提示）；`frontend/src/views/SslList.vue`（列表卡片 SNI 标注系统保留）。
- **数据**：新生成/更新的 server 证书 SAN 与 `sni` 字段将包含 `edge.local`；客户端证书不受影响；历史证书不受影响（不回溯修改）。