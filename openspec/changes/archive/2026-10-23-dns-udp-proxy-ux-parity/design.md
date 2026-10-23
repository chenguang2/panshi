# Design: dns-udp-proxy-ux-parity

## Context

四层代理页已完成四批修复（stream-proxy-ux-review-fixes，2026-10-23），共享层（PublishStatusTag 四态、showDeleteConfirm 三 opt-in、executeDeleteWithProgress retryable、分段控件样式）全部就绪。DNS 页 764 行为同期复制品，未接线。走查报告：/tmp/opencode/dns-ux-report.md（P1×8 + P2/P3×10，核验 18/18）。

## Goals / Non-Goals

- Goals：DNS 页对齐四层代理标准形态；修 3 个共享层遗留缺陷（抽屉 import、假成功判定、WAN 开关连带隐藏）
- Non-Goals：不改 DNS 配置数据结构（hosts 键名不动）；不新增独立功能；scheme-force-* 历史数据处置不在本变更（见决策点 3）

## Decisions

### D1. 后端域内端点四态接线（对称性）
`cluster_dns_proxies.py` 列表与详情端点照 `cluster_stream_proxies.py` 批 2 模式接 `derive_pending_publish` + `last_publish_status` 透传。响应 schema `StreamProxyResponse` 已含字段，仅补赋值。理由：DNS 页数据源是域内端点（`dnsApiPath`→`/clusters/{cid}/dns-proxies`），不接则前端换四态 Tag 后恒「已发布」（假态比缺态更糟）。

### D2. 假成功修正收敛在共享出口（logSingleDeleteResults）
现状：只选离线节点删除 → edgeResults 空 → 走「已完成」绿。修正：`deleteEdge=true` 且 `edgeResults.length===0` 且 `edgeNotices` 含 skipped 提示时 → `progress.status='exception'` + 文案「所选节点均未执行 Edge 删除（离线或不可达），Edge 侧配置未清理」。收敛在共享出口（约定：守卫放共享出口，新路径自动免疫），四层页同步受益。数据库段删除成功照常显示。

### D3. WAN 开关脱离 toggle 区
开关从 `.spwf-toggle`（代理类型区）移至 step2 的 DNS 配置区顶部（`form.proxy_type==='dns'` 时显示）。理由：toggle 区整组 v-if（defaultProxyType 存在时隐藏）是四层代理页修复的合理行为，WAN 藏在里面属位置错误非逻辑错误。

### D4. 资源名词参数化
`StreamProxyFormWizard`/`StreamProxyViewDrawer` 以 `props.defaultProxyType`（'normal'|'dns'）派生名词 `normal→四层代理 / dns→DNS 代理`，标题/按钮/成功 toast 统一走该映射。禁再手写资源名。

### D5. 抽屉 dnsHosts 键名
以页内 `DnsUdpProxyList.vue:261` 的 `cfg?.hosts` 为权威（后端 dns_config 组装实况），抽屉改 `hosts`。不兼容 `domains` 回退（该键从未存在于真实数据）。

## Risks / Trade-offs

- D2 改变共享层终态判定语义 → 按约定 #51-④ 跑同域既有测试（useClusterUtils.test.ts + 两页删除用例）
- 假成功修正会让「故意的仅库删除后 Edge 全 skipped」场景从绿变黄——该场景文案已明示「仅删除平台记录」时用户不会勾 Edge，影响面可控
- 抽屉 import 补齐后 vue-tsc 应当早已报错却未报——记录为工具盲区，不再深究（有守卫用例钉住）

## Migration Plan

1. 批 1：后端四态接线（RED→GREEN）+ 前端四态卡片/分段控件
2. 批 2：抽屉三缺陷 + WAN 开关 + 文案参数化
3. 批 3：删除风险（三 opt-in + retryable + D2 假成功）+ P2 批
4. 批 4：真页走查（对照四层代理页标准形态）+ 全量收口

## Open Questions（已全部拍板，2026-10-23 用户确认「都按推荐」）

- 域名级健康检查：默认收起 + 勾选才下发，默认值前后端统一（落批 2/3，对齐 stream 批 1 语义）
- 只选离线删除终态：警示态 exception + 原因文案（D2 即此决策的落地）
- `scheme-force-*` 50 条历史残留：保留用户数据，实施完成时导出清单供用户自查（不清理）
- TTL 单位：统一「15 s」格式
