# Proposal: ux-review-fixes

## Why

全站 UX/UI 评审（32 界面 × 4 维，报告 `docs/refactoring/ux-review-2026-10-04.md`，入库 commit `2b5ebcf9`）产出 H4/M10/L12 优先级体系，三批 TDD 修复已落地（H `e129aa9f` / M `25e026e3` / L `e9ec8d51`）。另有评审外随手修复：登录页「忘记密码？」死锚点（`a7ebe5cd`）。

## What Changes

spec 级变更（其余打磨项低于 spec 粒度，见报告与 tasks 清单）：

- **H2 SSL 到期预警**：证书卡片展示到期徽章（`<0` 已过期 / `≤30` 天临期 / 其余正常，剩余 N 天）；后端列表响应补到期计算字段
- **H3 DNS 标题术语对齐**：落地页标题须确认用户点击——UDP 页「DNS 代理（UDP）」、HTTP 页「DNS 代理（HTTP）」（此前分别为「DNS 代理」「DNS 查询」，与菜单「DNS代理[UDP]/[HTTP]」错位）
- **M1 权重语法统一**：四层代理目标节点权重显示改为全角括号「（100）」（此前 `:100`），与上游列表一致
- **登录页辅助行为**：用户名 autofocus；「忘记密码？」由死锚点改为信息弹窗引导（本平台无自助改密流程）

低于 spec 粒度、仅入档不立需求的项（详见报告）：H1 统计条换行、H4 节点图例、M2-M9（空态 CTA/edge.env 引导/表单状态/SSL 分行/版本空值/术语/动词/方法徽章）、L 批次排版与主次打磨、L4/L9/L12 三项勘误（代码核实推翻 OCR）。

## Capabilities

### Modified

- `ssl-certificate-management`：「SSL 证书列表展示」补到期徽章场景
- `dns-proxy-list`：列表标题对齐为「DNS 代理（UDP）」
- `dns-query-management`：列表标题对齐为「DNS 代理（HTTP）」
- `stream-proxy-management`：DNS 视图标题同步 + 目标权重全角括号展示

### Added

- `login-page-assist`（新能力）：登录页辅助行为（autofocus + 忘记密码引导 + 标点规范）

## Impact

- 后端：`backend/app/schemas/ssl.py`（到期字段）、`backend/tests/test_ssl_expiry.py`（5 例）
- 前端：`SslList.vue`、`DnsQueryList.vue`、`DnsUdpProxyList.vue`、四层代理列表（sp-target-wt）、`Login.vue`
- 守卫：`SslList.test.ts`、`clusterStats.source.test.ts`、`dnsPageTitles.source.test.ts`、`uxReviewL.source.test.ts`、`Login.test.ts`
- commits：`2b5ebcf9`（报告）、`e129aa9f`、`25e026e3`、`e9ec8d51`、`a7ebe5cd`
