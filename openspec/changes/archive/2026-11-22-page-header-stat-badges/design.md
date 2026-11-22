# Design: page-header-stat-badges

## Context

页头徽标 = `PageHeader` 的 `#stats` 槽 + `components/PageStatBadges.vue`（`.ph-inline > .ph-lite`，24px 胶囊，首项 accent）。它与状态 chips 行（`.l5-chiprow`，承载「全部 N / 已启用 N / 已禁用 N」）、页内统计卡（概览的 `dstat`）是不同承载面。

现状（2026-11-21 实测）：设计页 16/16 有徽标；实现 4/16（节点、上游、路由、统一管理），其余 11 页缺失。

## Goals / Non-Goals

- Goals：徽标覆盖与设计页一致；口径统一为「补充维度」；用守卫钉住两侧一致。
- Non-Goals：不改 chips 与页内统计卡；不为没有设计页的系统页（数据库管理、用户管理等）编造徽标；不新增后端聚合端点（全部前端聚合，超上限时按 D4 降级）。

## Decisions

### D1 · 语义：只做「补充维度」

- 页头徽标 SHALL 提供 chips 之外的信息：如分组数、节点数、目标数、域名数、插件数、引用处数、资源总量、过期数。
- 若页面已有 chips 总数（「全部 N」），徽标 SHALL NOT 再放同一总数。
- 首项恒为 accent（`PageStatBadges` 既有行为），作主统计。

### D2 · 每页取值（与设计页一一对应）

| 页面 | 徽标 | 数据来源（前端聚合） |
|---|---|---|
| 集群管理 / 统一管理 | N 分组 · M 节点 | `distinct group_name`（未分组计一组）+ Σ`node_count` |
| 节点管理 | N 集群 | 节点列表去重 `cluster_id`（既有） |
| 上游管理 | N 集群 | `/upstreams/status-counts.cluster_count`（既有） |
| 路由管理 | N 上游 | `/routes/status-counts.upstream_count`（既有） |
| 四层代理 | N 集群 · M 个目标 | `distinct cluster_id` + Σ`targets.length` |
| DNS 代理 UDP / HTTP | N 集群 · M 个域名 | `distinct cluster_id` + Σ`dnsDomains(p).length`（HTTP 用 `domains(r)`） |
| 插件组 | N 集群 · M 个插件 | `distinct cluster_id` + Σ`Object.keys(plugins).length` |
| 插件元数据 | N 集群 · M 插件 | `distinct cluster_id` + `distinct plugin_name` |
| 插件开关 | N 个分类 · M 处引用 | `categoryList.length` + Σ(`refs.routes + plugin_configs + global_rules`) |
| 全局规则 | N 集群 · K 节点同步失败 | `distinct cluster_id` + `last_publish_status === 'partial'` 计数（>0 用 bad 色） |
| 静态资源 | N 集群 · X MB 总量 | `distinct cluster_id` + Σ`file_size`，`formatFileSize`；为 0 时显 `—` |
| CA 根证书 | N 即将过期 · K 已过期 | `expire_days`（0–30 即将过期、<0 已过期） |
| 服务器证书 | N 集群 · K 已过期 | 同上（仅非 CA 证书，即 `certs`） |
| 概览 | 不放 | 数字已由页内 4 张统计卡承担 |

### D3 · 概览页

概览的 `8 集群 / 31 节点` 与统计卡重复，实现本就没有徽标；本次把设计页 `overview.html` 标题旁的 `ph-inline` 删除，并在守卫里反向断言（设计页无 `ph-inline` + 实现无 `PageStatBadges`）。

### D4 · 数据与降级

- 全部取「当前已加载数据集」（各页 `page_size = PAGE_SIZE_CARD_GRID` 上限 500），不额外发请求；筛选条件变化时徽标随数据集刷新（与节点/上游/路由现行为一致）。
- 拿不到的维度（字段缺失/null、证书 PEM 解析失败 → `expire_days = null`）**不计入统计**，不显示估算值；总量为 0 时显示 `—`。禁止用 0 冒充「无数据」（#64 同口径）。

### D5 · 守卫

`frontend/src/views/__tests__/pageHeaderActions.source.test.ts` 增加一段：

- 对 14 对「页面 ↔ 设计页」（不含概览）：设计页 header 区域（`class="page-header"` 起、截到 `page-header-actions` 之前）是否含 `ph-inline`，必须等于实现源码是否含 `PageStatBadges`。
- 概览：设计页 header 无 `ph-inline` 且 `Dashboard.vue` 无 `PageStatBadges`。

## Risks / Trade-offs

- 徽标随「已加载数据集」而非全库统计：如果在某页把筛选缩到 1 个集群，徽标会跟着变小。与节点/上游/路由现状一致，本变更不引入「全库口径 vs 当前筛选口径」的第二套语义。
- 插件开关的「处引用」是各插件引用数之和（同一路由引用多个插件会重复计数），设计稿的 `44 处引用` 就是这个口径，已在 spec 中写明「处」而不是「个路由」。
- 证书过期统计依赖 `expire_days`（序列化期解析 PEM）；国密双证书等解析失败时为 null，不计入——如实少算而非误报。
