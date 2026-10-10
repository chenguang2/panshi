# Proposal: restricted-data-scoping

## Why

上一变更（overview-page-ux）9.4 实机验收发现的受限视角数据口径不一致（平台既有行为，非该变更引入）：

1. **可见性契约已在两处落地、概览域两处漏配**——平台契约「非管理员仅见被分配集群（`sys_user_cluster`）」已由 `GET /clusters`（v3 8A 安全修复，含守卫采样）与 `GET /nodes`（nodes.py 权限过滤段，空分配直接返回空集）确立；但 `GET /dashboard/stats` 与 `GET /dashboard/recent-routes` 对任意登录用户返回**全局口径**。
2. **实测证据**（临时受限账号，clusters+routes 权限、零分配）：`/clusters` total=0，而 `/dashboard/stats` 集群=6（全局）、`/dashboard/recent-routes` items=10（含不可见集群的路由）。
3. **后果**：受限用户在概览页看到「统计卡 集群 6 vs 集群卡 空态」的同页矛盾数字；最近创建的路由名/URI 暴露其不可见集群的信息（信息暴露 + 语义混乱）；空态文案「还没有集群，去创建 →」对受限用户是错误指引（集群存在，只是未分配给他）。
4. 概览页前端（上一变更）已就位 fetch-visible-only 与权限显隐，数据流对口径收敛**零改动需求**——修复收敛在后端两端点 + 空态文案一处。

## What Changes

- **后端（契约补齐）**：`/dashboard/stats` 与 `/dashboard/recent-routes` 对非管理员按 `sys_user_cluster` 分配过滤（单一 helper 实现）；管理员全量口径**完全不变**。
- **users 计数保持全局**（有意行为，非遗漏）：非集群域计数、无分配语义；UI 侧「用户管理」chip 为 adminOnly，受限用户界面不消费该数字。
- **前端（空态文案角色区分）**：管理员保持「还没有{资源}，去创建 →」；非管理员改「暂无可见{资源}，前往{资源}管理 →」（CTA 仍链接管理页——被分配数据可在管理页查看）；三张数据卡统一该模式。
- **完成态**：受限用户在概览页看到的一切数字与明细 = 被分配集群口径，全页单一口径，与集群管理页既有口径一致。

## Capabilities

### Added

- `cluster-visibility-scoping`：概览域只读端点（`/dashboard/stats`、`/dashboard/recent-routes`）的非管理员分配可见性契约——与 `/clusters`、`/nodes` 既有契约同源同语义；可见性 helper 单实现；管理员口径不变；users 计数全局语义钉死。

### Modified

- `platform-overview-page`：「数据加载三态」需求中空态引导按角色区分（管理员「去创建」/ 非管理员「暂无可见，前往管理」）；新增「受限视角口径一致」要求（统计卡与明细卡同口径，节点三态摘要同契约）。

## Non-Goals（本轮不做）

- **受限视角空态文案的全站治理（评审确认 C）**：集群管理页空态「还没有集群 + 新建集群」（`ClusterList.vue`，cluster-ux-close-loop 6.4 所改）对零分配受限用户同样误导且「新建集群」按钮对其大概率不可用，NodeList「暂无节点」等同类较轻——管理页空态文案治理沿用本变更 design D5 模式，另行立项。
- **`/clusters`、`/nodes` 既有内联过滤实现的重构收敛**：行为等价、触碰 v3 8A 安全修复代码回归面大收益低；契约「内联×9 + helper×1」的多点实现记录于 design 风险，出现新的消费场景时再统一上移。
- **users 计数的 API 层权限收敛**：保持全局返回，语义见 design D3。
- **集群分配管理 UX**：用户管理页的集群分配功能既有，不动。
- **其他全局只读端点**（relay、metrics、审计、备份等）的口径收敛：如需另行评估立项。
- **管理员视角任何行为变化**：全量口径与响应形状不变。

## Impact

- **后端**：`backend/app/api/v1/dashboard.py`（`_visible_cluster_ids` helper + 两端点过滤，零模型变更、零新路由）；`backend/tests/test_dashboard.py` 扩展（受限用户夹具：零分配 / 部分分配 / 管理员三对照）
- **前端**：`frontend/src/views/Dashboard.vue` 空态文案角色区分 + `__tests__/Dashboard.test.ts` 用例（含受限口径一致断言）
- **验收**：受限账号实机复查（复用 `ux_accept_tmp`：先零分配验全空一致，再经用户管理分配部分集群验「统计卡=明细卡」；验收完成后该账号处置由用户决定）
- **行为微变（已确认接受）**：受限用户概览数字从全局变为分配口径（变小）——与集群管理页既有口径一致，同页自洽；管理员无感
- **爆炸半径（已核实最小）**：`/dashboard/*` 消费方仅概览页（grep 全仓核实），无其他前端或脚本调用方
