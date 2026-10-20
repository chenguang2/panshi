# Tasks: version-modal-publish-exit-wiring

## 1. 静态资源两入口接线（已实施，随本变更入库）

- [x] 1.1 `StaticResourceList.vue`：`:can-publish="true"` + `@publish-requested` → 复用本页 `publishResource`（RED→GREEN，测试断言 canPublish 传递 + emit 后发布确认弹窗可见且资源上下文正确）
- [x] 1.2 `ClusterStaticResources.vue`：同款接线 → 复用 composable `publishStaticResource`（走父级共享发布弹窗，断言 `openPublishModal` 以「发布静态资源「{name}」」+ clusterId 调用）

## 2. 弹窗 rollback 端点精确路由（stream_proxy 分支修复）

- [x] 2.1 RED：VersionManagementModal 测试新增——resourceType=`stream_proxy` 恢复 vX，断言 `api.post` 收到 `/clusters/{cid}/stream-proxies/{rid}/rollback/{v}`（当前实现落 `/routes/` 必红）
- [x] 2.2 GREEN：弹窗 rollback 端点链补 `stream_proxy` 分支；同测试追加断言 URL MUST NOT 含 `/routes/`（防再落空的守卫）
- [x] 2.3 回归：既有 dns_proxy / ssl rollback 端点断言不变（若测试文件无既有断言，顺带补 dns_proxy 一条防链再断裂）

## 3. 三域接线

- [x] 3.1 `StreamProxyList.vue`：`:can-publish="true"` + `@publish-requested` → `proxies` 按 `vmId` 回查 → `publishProxyAction(p)`；测试断言接线与发布确认弹窗上下文
- [x] 3.2 `DnsUdpProxyList.vue`：同款（列表 ref 以实现为准）→ `publishProxyAction(p)`；同款测试
- [x] 3.3 `SslList.vue`：`:can-publish="true"` + `@publish-requested` → `certs` 按 `vmId` 回查 → `publishCert(c)`；同款测试

## 4. spec 同步与收口

- [x] 4.1 `config-version-management` MODIFIED delta 合并回主 spec（已接线清单扩充 5 入口 + 回滚端点精确路由场景）
- [x] 4.2 全量验证：触碰文件 vitest 全绿 + `npx vue-tsc -b` 零错误
- [x] 4.3 提交（含已实施的静态资源接线）
