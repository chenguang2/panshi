# Design: version-modal-publish-exit-wiring

## 已核验锚点

- 弹窗 rollback 端点链：`VersionManagementModal.vue` ~L661-673（upstream → plugin_config → global_rule → static_resource → ssl → dns_proxy → **else routes**；无 stream_proxy 分支）
- 后端 rollback 端点：stream-proxy `cluster_stream_proxies.py:611`（存在，前端没调对）；dns/ssl 分支前端已有
- 三域既有发布链路（零新实现）：
  - `StreamProxyList.vue`：`publishProxyAction(p)`（L369）+ `publishingProxy`/`publishVisible`；列表 `proxies`（`useStreamProxyList` 返回）
  - `DnsUdpProxyList.vue`：`publishProxyAction(p)`（L365）；列表来源同款流代理 composable
  - `SslList.vue`：`publishCert(cert)`（L424）；列表 `certs`（L227）
- 版本弹窗上下文 refs 三域同构：`vmVisible/vmId/vmClusterId/vmName`

## 决策

### D1. rollback 分支修在弹窗内，不做端点映射表重构

三元链已有 7 个分支，本变更只补 `stream_proxy` 一支（插在 dns_proxy 之前），不动整体结构。守卫测试直接断言「stream_proxy 恢复调用的 URL 以 `/stream-proxies/` 为段、MUST NOT 含 `/routes/`」——若未来新资源类型再漏分支，由「恢复端点包含正确资源段」断言暴露，不引入新抽象。

### D2. 三域 handler 模式与静态资源接线完全同构

handler 一律「按 `vmId` 回查本域列表 → 找到则调既有发布函数」：

- 找不到记录（列表未含该 id，如刷新后）→ 静默 no-op——与静态资源接线一致；恢复动作已成功落库，不因入口列表状态阻断用户（用户可从卡片再点发布）
- 发布确认弹窗标题/摘要/失败预选全部沿用各页既有发布函数（发布编排单实现，禁止第四份复制）

### D3. `canPublish` 门控语义不变

弹窗默认 false（未接线域不出现可点按钮，避免「有按钮点了没反应」——spec 既有红线）。本次接线的 5 个入口（静态×2 + 流代理 + DNS UDP + SSL）显式传 true。EdgeEnv 维持不接（加载到编辑器语义）。

### D4. spec 落点单点：config-version-management

弹窗行为（出口条、回滚端点）全部归 `config-version-management`「版本回滚语义（恢复不自动发布）」需求 MODIFIED；不改 `stream-proxy-management` 等域 spec（其版本管理需求已被共享弹窗语义覆盖，避免同一行为双处声明）。已接线清单场景改为枚举式追加。

## 测试策略

- RED：VersionManagementModal 测试补 stream_proxy rollback 端点断言（当前实现调 `/routes/` 必红）
- GREEN：补分支转绿；同测试断言 `/routes/` 不出现（守卫）
- 五入口接线测试（canPublish 传递 + publish-requested → 既有发布函数被调/发布确认弹窗可见）：静态两入口已完成（本会话），三域照抄同款模式
- 回归：`npx vitest run` 触碰文件 + `vue-tsc -b`
