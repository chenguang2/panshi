## 1. 后端：IP SAN 校验

- [x] 1.1 在 `backend/app/schemas/ssl.py` 的 `SslCertificateGenerateRequest.ip_sans` 添加 `field_validator`，用 `ipaddress.ip_address()` 校验每个 IP，非法值抛 `ValueError`
- [x] 1.2 确认非法 IP 返回 422 且错误信息指明无效 IP
- [x] 1.3 确认合法 IPv4 / IPv6 通过校验

## 2. 前端：共享 IP 校验工具

- [x] 2.1 新建 `frontend/src/utils/ip.ts`，导出 `isIpAddress()`（IPv4 + IPv6 校验，增强 IPv6 段检查）
- [x] 2.2 为 `isIpAddress` 补充 IPv4/IPv6 合法与非法用例的单测（`frontend/src/utils/__tests__/ip.test.ts`）

## 3. 前端：生成对话框接入校验

- [x] 3.1 `SslGenerateDialog.vue` 的 `addIpTag()` 用 `isIpAddress` 校验，非法值拒绝加入并 `message.warning` 提示
- [x] 3.2 确认合法 IP（IPv4/IPv6）正常加入 `ipTags`

## 4. 前端：复用共享工具（SslFormDrawer）

- [x] 4.1 将 `SslFormDrawer.vue` 内的 `isIpAddress` 替换为引用 `utils/ip.ts` 的共享实现（保持 DNS/IP 分组行为不变）

## 5. 测试与验证

- [x] 5.1 后端单测：`SslCertificateGenerateRequest` 拒绝非 IP，接受合法 IPv4/IPv6
- [x] 5.2 运行后端完整测试套件确认无回归
- [x] 5.3 运行前端 `ip.test.ts` 与相关组件单测
- [x] 5.4 运行前端类型检查确认无回归
