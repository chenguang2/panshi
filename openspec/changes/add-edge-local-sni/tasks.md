## 1. 后端：强制合并系统保留域名

- [ ] 1.1 在 `backend/app/api/v1/cluster_ssl.py` 定义模块级常量 `RESERVED_SNIS = ("edge.local",)`
- [ ] 1.2 在 `_generate_local` 开头对 `req.dns_sans` 强制合并 `RESERVED_SNIS`（`dict.fromkeys` 去重保序，`edge.local` 置前），得到统一的 `dns_sans` 列表
- [ ] 1.3 将合并后的 `dns_sans` 同时用于：证书生成调用（`generate_dual_certificates`/`generate_certificate`）、`sni_str` 拼接、客户端证书生成（`_generate_client_dual_certs`）
- [ ] 1.4 确认服务端与客户端证书的 SAN 与 DB `sni` 字段都包含 `edge.local`

## 2. 前端：生成对话框锁定展示

- [ ] 2.1 在 `frontend/src/components/SslGenerateDialog.vue` 定义常量 `RESERVED_SNIS = ['edge.local']`
- [ ] 2.2 DNS SAN 标签区预置 `edge.local` 锁定 chip（灰色、锁图标、无删除按钮、标记"系统保留"）
- [ ] 2.3 提交时确保 `dns_sans` 始终包含 `edge.local`（与用户输入的 DNS 去重合并）
- [ ] 2.4 校验逻辑调整为：`edge.local` 计入"至少一个 DNS/IP SAN"的有效性判断

## 3. 前端：编辑查看标注系统保留域名

- [ ] 3.1 在 `frontend/src/components/SslFormDrawer.vue` 只读 SAN 展示中，若含 `edge.local` 则标注"系统保留"
- [ ] 3.2 确认不影响已生成证书的其他 SAN 展示

## 4. 测试与验证

- [ ] 4.1 后端单测：`_generate_local` 生成的证书 SAN 含 `edge.local`（RSA/ECC/SM2 双证书、客户端证书各场景）
- [ ] 4.2 后端单测：`sni` 字段含 `edge.local` 且与 SAN 一致
- [ ] 4.3 后端单测：用户已传 `edge.local` 时不重复
- [ ] 4.4 前端单测：`SslGenerateDialog` 预置锁定 `edge.local`、不可删除、提交始终含它
- [ ] 4.5 运行后端完整测试套件确认无回归
- [ ] 4.6 运行前端类型检查与相关单测确认无回归
