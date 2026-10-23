# Proposal: dns-udp-proxy-ux-parity

## Why

DNS 代理（UDP）页（DnsUdpProxyList.vue）是四层代理页的姊妹复制页，未覆盖 2026-10-23 四层代理体验修复四批（stream-proxy-ux-review-fixes）的任何页面层改动。真页走查（@designer，test 集群全生命周期，36 截图）确认 **8 条 P1**（状态说谎、功能断裂、假成功）与 10 条 P2/P3，核验 18/18 成立。四层代理页与 DNS 页是同域姊妹页，共享代码已在、仅页面层未接线——本变更是纯粹的「对齐既有标准形态 + 修共享层遗留缺陷」。

## What Changes

- **P1 状态说谎**：卡片二元徽章换 PublishStatusTag 四态（含 pending/partial）；后端域内端点族 `/clusters/{cid}/dns-proxies*` 接入 `derive_pending_publish`（0 处 → 全 9 端点对称）；列表加状态分段控件（连接式 segmented，与四层页同款）
- **P1 抽屉缺陷**：补 PublishStatusTag import（模板已用未导入，渲染空白）；dnsHosts 键名 `domains`→`hosts`（域名映射从未在抽屉显示过）；DNS 型隐藏「负载均衡」行（四层字段泄漏）
- **P1 文案**：向导/抽屉/toast 资源名词参数化（proxy_type='dns' → 「DNS 代理」），消除全程自称「四层代理」
- **P1 功能断裂**：内外网分离（WAN）开关移出代理类型 toggle 区，DNS 型始终可配
- **P1 删除风险**：三 opt-in（在线/离线标识+默认全选在线+子集后果行）+ retryable 重试；共享层修正「只选离线节点删除 → 绿色已完成」假成功为警示态
- **P2/P3**：空态两态化+SVG、共享搜索防抖、发布确认带资源名+v(N+1)、双徽章收敛、「该DNS 代理」粘连、TTL 单位统一（s）

## Impact

- Specs：新增 `dns-udp-proxy-management`；MODIFIED `stream-proxy-publish-status`（域内端点契约）
- 代码：`DnsUdpProxyList.vue`、`StreamProxyFormWizard.vue`、`StreamProxyViewDrawer.vue`、`useClusterUtils.ts`（假成功修正）、`cluster_dns_proxies.py`（四态接线）
- 零 schema 变更、零迁移
