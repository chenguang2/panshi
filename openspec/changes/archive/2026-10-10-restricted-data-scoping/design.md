# Design: restricted-data-scoping

## Context

平台可见性契约现状（2026-10-10 全景核实）：

- **契约已覆盖全部 9 个集群域端点**：clusters（列表 + 详情）、nodes、upstreams、routes、global_rules、plugin_configs、plugin_metadata、static_resources、users（`{user_id}/clusters` 分配查询）均按 `sys_user_cluster`（UserCluster）对非管理员过滤；各处谓词同源、实现细节略异——`/clusters`（clusters.py，注释明确为 **v3 8A 安全修复**，`test_security_guard.py` 采样防回归）与 `/nodes`（空分配**直接返回空集**不查库）为代表先例。
- **`GET /dashboard/stats`、`GET /dashboard/recent-routes`（dashboard.py）是最后的漏配**：仅需登录（`get_current_user`），无任何可见性过滤 → 全局口径。
- `UserCluster`（`sys_user_cluster`：user_id + cluster_id）：集群分配的存储载体，用户管理页有既有分配 UI。
- 概览页前端（overview-page-ux 已归档）已实现 fetch-visible-only、权限显隐、三态摘要——后端口径收敛后**前端数据流零改动**，仅空态文案需角色区分。
- `/dashboard/*` 消费方仅 `Dashboard.vue`（全仓 grep 核实），无其他调用方——爆炸半径最小。
- 实测（ux_accept_tmp，clusters+routes 权限、零分配）：`/clusters` total=0 vs `/dashboard/stats` 集群=6 vs `/dashboard/recent-routes` items=10。

## Goals / Non-Goals

Goals：受限用户在概览页看到的一切数字与明细 = 被分配集群口径，全页单一口径；空态文案不再误导；管理员零行为变化。
Non-Goals：见 proposal（不动 /clusters、/nodes 内联实现；users 计数收敛；分配管理 UX；其他全局端点）。

## Key Decisions

### D1 契约方向：补齐既有契约，不造第二种口径

全部集群域管理端点（9 个）已确立「非管理员仅见被分配集群」。本变更把同一契约补齐到概览域两个只读端点——**是补漏，不是新设计**；补齐后集群域数据口径全站统一。备选「仅前端改文案掩饰数字不一致」被否：数字矛盾仍在，且最近路由暴露不可见集群信息是实质问题（信息暴露 + 语义混乱）。

### D2 helper 单实现；既有内联实现不动

`dashboard.py` 模块内私有 `_visible_cluster_ids(db, user) -> list[int] | None`：admin → `None`（不过滤）；非 admin → 分配 id 列表（可为空集）。stats 与 recent-routes 共用。既有 **9 处内联实现本轮不动**：行为等价，触碰 v3 8A 安全修复代码回归面大收益低。契约「内联×9 + helper×1」多实现记录为风险；出现新的消费场景再统一上移（YAGNI + 约定 #3 不预设共享层）。

### D3 stats 各计数口径明细

**集群域计数（10 项）全部按可见集群过滤**：clusters、nodes、nodes_online、nodes_untested、upstreams、routes、plugin_configs、global_rules、static_resources、plugin_metadata（各模型均含 cluster_id 或经 cluster 关联，过滤方式为 `Model.cluster_id.in_(visible)` 或对 Cluster 表直接 count 时 `Cluster.id.in_(visible)`）。
**users 计数保持全局**：非集群域、无分配语义；UI「用户管理」chip 为 adminOnly，受限用户界面不消费——记录为**有意行为非遗漏**（钉进 spec，防未来当漏洞重复上报）。

### D4 recent-routes 过滤位置

查询已 `join(Cluster, Route.cluster_id == Cluster.id)`（取集群展示名），补同一 where 谓词即可；「最近 10 条」语义 = **可见范围内**最近创建。响应形状零变化（created_at 等字段不动）。

### D5 空态文案角色区分

| 角色 | 文案 | CTA |
|---|---|---|
| 管理员 | 还没有{资源}，去创建 → | 链接管理页（不变） |
| 非管理员 | 暂无可见{资源}，前往{资源}管理 → | 链接管理页（保留——被分配数据可在管理页查看） |

「去创建」对受限用户是错误指引（集群存在只是未分配，且创建通常为管理员动作）。判定依据 `authStore.user?.role === 'admin'`（与侧边栏/概览权限过滤同源）。三张数据卡（集群/节点/路由）统一该模式。

### D6 管理员零行为变化 = 无回归守卫

helper 对 admin 返回 None、不进过滤分支，两响应与现状**完全一致**。既有 `test_dashboard.py` 3 用例（管理员语境）必须原样绿——作为无回归的行为守卫写入批次 1。

## Risks / Trade-offs

- **契约多点实现**（9 处内联 + dashboard helper）：语义漂移风险低（同一模型同一谓词），出现新的消费场景再上移共享 util。
- **受限用户数字「变小」可能被误读为丢数据**：与集群管理页既有口径一致（同站自洽），空态文案同步改「暂无可见」引导去向；实机验收覆盖。
- **全站受限空态文案治理为后续项**（评审确认 C）：集群管理页空态「还没有集群 + 新建集群」（ClusterList.vue）对零分配受限用户同样误导，NodeList「暂无节点」等同类较轻——已记入 proposal Non-Goals，另行立项（模式沿用 D5）。
- **空集语义**：非管理员零分配 → stats 集群域全 0（短路返回，对齐 /nodes 空集先例）、recent-routes 空、（经 fetch-visible-only）对应卡照常渲染空态。
- **users 全局计数对受限用户可见（API 层）**：有意保留；UI 不消费；若未来要求彻底收敛（如按权限隐藏字段），另行评估——不在本变更造字段级权限。

## Migration Plan

批次 1 后端（TDD：零分配 / 部分分配 / 管理员三对照）→ 批次 2 前端空态文案（与批次 1 无文件交集，可并行）→ 批次 3 回归 + 实机受限复查（复用 ux_accept_tmp：零分配验一致 → 用户管理分配部分集群验「统计卡=明细卡」）。
