## 1. 后端：强制合并系统保留域名（服务端证书）

- [x] 1.1 在 `backend/app/api/v1/cluster_ssl.py` 定义模块级常量 `RESERVED_SNIS = ("edge.local",)`
- [x] 1.2 在 `_generate_local` 开头对 `req.dns_sans` 做归一化（`strip().lower()`，IP 仅 `strip()`）后强制合并 `RESERVED_SNIS`（`list(dict.fromkeys([*RESERVED_SNIS, *normalized_dns]))`，`edge.local` 置前去重）
- [x] 1.3 将合并后的 `dns_sans` 仅用于：**服务端证书**生成调用（`generate_dual_certificates`/`generate_certificate`）、`sni_str` 拼接、服务端记录入库
- [x] 1.4 **客户端证书不合并**：`_generate_client_dual_certs` 与 `cert_type=client` 请求继续使用用户原始 `dns_sans`/`ip_sans`；客户端证书记录 `sni` 使用用户原始 SAN（保留 `sni_str or cn_client` 兜底）
- [x] 1.5 确认服务端证书 SAN 与 DB `sni` 字段都包含 `edge.local`；客户端证书不要求

## 2. 后端：更新/回滚路径强制保留

- [x] 2.1 `update_ssl_certificate`（`PUT /ssl/{id}`）：更新 `sni` 时，若证书为 server 类型（`cert_type == "server"` 且非 CA），按 1.2 的规则归一化合并 `edge.local` 后写回；client 类型不合并
- [x] 2.2 `rollback_ssl_certificate`：回滚 `sni` 时按回滚后的 `cert_type` 判断，server 证书强制合并 `edge.local`

## 3. 前端：生成对话框锁定展示

- [x] 3.1 在 `frontend/src/components/SslGenerateDialog.vue` 定义常量 `RESERVED_SNIS = ['edge.local']`
- [x] 3.2 DNS SAN 标签区预置 `edge.local` 锁定 chip（灰色、锁图标、无删除按钮、标记"系统保留"）
- [x] 3.3 提交时确保 `dns_sans` 始终包含 `edge.local`（大小写不敏感去重，统一小写后与用户输入合并）
- [x] 3.4 `addDnsTag` 去重改为大小写不敏感（`EDGE.LOCAL` 与 `edge.local` 视为同一项，避免与锁定 chip 视觉重复）
- [x] 3.5 校验逻辑调整为：`edge.local` 计入"至少一个 DNS/IP SAN"的有效性判断，允许"仅 `edge.local`"的证书

## 4. 前端：编辑/列表标注系统保留域名 + 导入提示

- [x] 4.1 `frontend/src/components/SslFormDrawer.vue` 只读 SAN 展示中，若含 `edge.local`（大小写不敏感）则标注"系统保留"；确认不影响已生成证书的其他 SAN 展示
- [x] 4.2 `frontend/src/views/SslList.vue` 卡片 SNI 展示中，若含 `edge.local`（大小写不敏感）则标注"系统保留"
- [x] 4.3 `frontend/src/components/SslFormDrawer.vue` 创建/导入模式：`cert_type=server` 时提示"建议 SNI 包含系统保留域名 `edge.local`，否则管理链路/健康检查可能握手失败"

## 5. 测试与验证

- [x] 5.1 后端单测：`_generate_local` 生成的**服务端**证书 SAN 含 `edge.local`（RSA/ECC/SM2 双证书各场景）
- [x] 5.2 后端单测：**客户端**证书（SM2 客户端双证书、`cert_type=client`）SAN **不含** `edge.local`，保留用户原始 SAN
- [x] 5.3 后端单测：server 证书 `sni` 字段含 `edge.local` 且与 SAN 一致
- [x] 5.4 后端单测：用户已传 `edge.local`（含 `EDGE.LOCAL`/`Edge.Local` 大小写变体）时不重复且归一为小写
- [x] 5.5 后端单测：更新接口对 server 证书 `sni` 强制合并 `edge.local`；client 证书不合并
- [x] 5.6 后端单测：回滚接口对 server 证书 `sni` 强制合并 `edge.local`
- [x] 5.7 前端单测：`SslGenerateDialog` 预置锁定 `edge.local`、不可删除、提交始终含它、大小写变体去重
- [x] 5.8 前端单测：`SslFormDrawer` 编辑标注"系统保留"（含大小写变体）、导入模式提示
- [x] 5.9 运行后端完整测试套件确认无回归
- [x] 5.10 运行前端类型检查与相关单测确认无回归