## Why

Edge 网关节点默认使用 `edge.local` 作为内部管理/健康检查的访问域名。实际运行中，客户端（如 `192.168.0.103`）以 `SNI=edge.local` 访问网关 `16610` 端口时，因生成证书的 SAN 未包含 `edge.local`，nginx 报 `failed to match any SSL certificate by SNI: edge.local`，导致管理链路/健康检查握手失败。因此需要在生成证书时**默认**将 `edge.local` 写入证书 SAN，保证平台自身管理链路不报警。

## What Changes

- 生成 SSL 证书（`dns_sans`）时，系统**强制**加入 `edge.local` 域名，用户无需（也不能）移除。
- `edge.local` 作为**系统保留域名**：前端生成对话框默认展示且**不可删除**（锁定样式），后端生成接口**兜底合并**（即使绕过前端也生效）。
- 证书 SAN 列表在编辑查看时对 `edge.local` 明确标注"系统保留"。

## Capabilities

### New Capabilities
<!-- 无新能力引入 -->

### Modified Capabilities
- `ssl-certificate-generation`: 生成证书时强制合并系统保留域名 `edge.local` 到 DNS SAN，且不可被用户移除。

## Impact

- **后端**：`backend/app/api/v1/cluster_ssl.py` 的 `_generate_local`（生成服务端/客户端证书时合并 `dns_sans`）；`backend/app/services/cert_generator.py` 的 SAN 构建。
- **前端**：`frontend/src/components/SslGenerateDialog.vue`（生成对话框预置锁定 `edge.local` chip）；`frontend/src/components/SslFormDrawer.vue`（编辑查看时标注系统保留域名）。
- **数据**：新生成的证书 SAN 将包含 `edge.local`；历史证书不受影响（不回溯修改）。
