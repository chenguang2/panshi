# Design: overview-page-ux

## Context

概览页是「核心功能」首位页面，当前实现（`views/Dashboard.vue`，395 行）为四段式骨架：4 张 StatCard → 集群状态 + 节点在线双栏 → 最近路由 → 快捷入口/更多资源。骨架复用了 StatCard / TableCard / BadgeStatus 既有组件词汇，视觉健康；问题集中在**数据语义、三态缺失、权限缺位、时间锚点缺位**四个横切面。本变更不改骨架，只修正语义与机制。

已核实的数据契约事实（设计依据）：

- `Cluster.status`（Integer 1/0）= 平台侧启用/禁用开关，与运行健康无关；`cluster-ux-close-loop` 已全站统一「已启用/已禁用」术语，概览页是最后一个仍写「正常运行/离线」的页面。
- `Node.status`（Integer 1/0）= 上次连通性测试回写结果（测试通过置 1、失败置 0），非实时心跳；无 `last_checked_at` 字段。
- `GET /dashboard/stats` 返回 9 个计数，前端只展示 4 个；`GET /dashboard/recent-routes` 按 `Route.created_at` 倒序取 10 条，响应无时间字段。
- 前端 `onMounted` 四请求各自 `.catch(() => null)`，失败无痕 → 页面显示假 0。
- 路由守卫 `router.beforeEach` 对无权限路由静默 `return '/'`（点击无反应的根因）；AppSidebar 有现成 `permission + feature + adminOnly` 三元过滤。
- 后端权限门控：`GET /clusters` 根端点需 `clusters` 权限、`GET /nodes` 需 `nodes` 权限（`nodes.py` `require_permission('nodes')`），而 `/dashboard/*` 仅需登录——受限用户若无条件拉全量数据即命中 403（预期的权限拒绝 ≠ 系统故障）。
- `Node.status` 默认值为 **1**，`status_detail`（最近一次 ansible-runner 执行结果 JSON，约定外结构）未测试时为 **NULL**——新建从未测试的节点在 status 单维度上与「检测通过」不可区分，须以 `status_detail` 判空区分「未检测」。
- `formatMonthDayTime`（`utils/format.ts`）把 naive UTC 按 Asia/Shanghai 渲染为「MM/DD HH:mm」短格式，最适合「最近」语义。

## Goals / Non-Goals

- Goals：概览页只说数据真实承载的话；故障可感知可重试；入口与侧边栏同源收敛；所有数字有时间锚点；后端仅补两个响应字段。
- Non-Goals：见 proposal（实时探测、last_checked_at、自动轮询、全站节点术语统一、路由守卫调整、行级深链、明细分页）。

## Key Decisions

### D1 概览定位诚实化：拒绝「假实时」

页面承诺的语义上限 = 数据真实承载的上限：**资源清点 + 上次检测结果 + 最近变化**。不做实时健康总览（无探测数据源）、集群卡不再用「状态」暗示健康检测（标题改「集群」）、副标题从「网关运行状态与快捷入口」改「平台资源统计与快捷入口」。用户旅程重排为：规模（StatCard）→ 关注点（集群启用 + 节点连通）→ 变化（最近创建的路由）→ 操作（权限过滤后的入口）。

### D2 状态术语钉死

| 对象 | 现文案 | 本变更 | 语义 |
|---|---|---|---|
| 集群徽章 | 正常运行 / 离线 | **已启用 / 已禁用** | `Cluster.status` 启用开关，对齐 cluster-ux-close-loop 全站口径 |
| 集群卡标题 | 集群状态 | 集群 | 纯启用开关不称「状态」 |
| 节点卡标题 | 节点在线 | 节点连通状态 | 「在线」是实时语义 |
| 节点徽章 | 在线 N / 离线 N | **检测通过 X · 未检测 Z · 失败 Y**（三态） | 上次连通性测试结果；未检测单列（D5 口径） |
| 节点行徽章 | 离线 | 检测失败 | 同上；「失败」暗示可重测 |
| 全通过横幅 | 全部 N 个节点在线 | 全部 N 个节点上次检测通过 | 仅当未检测=0 且失败=0 时显示 |

节点术语仅改概览页：概览是「摘要卡」语境，精确语义优先；节点管理页等列表语境的全站统一另行评估（Non-Goal）。副标题「Edge 网关节点」改动态三态「通过 X · 未检测 Z · 失败 Y」（口径见 D5）。

### D3 三态规格：错误 > 空态 > 加载，绝不显示假 0

- **错误态**：已发起请求的成败记入 `loadErrors`（`stats` / `routes` / `clusters` / `nodes` 键）。全部已发起请求失败 → 页头下方 danger 横幅「数据加载失败，请检查后端服务是否可用 [重试]」；局部失败 → 横幅「部分数据加载失败：{资源名}，以下内容可能不完整 [重试]」，且失败区显示轻量错误条「加载失败 [重试]」。**重试只重发失败的请求**。失败区 MUST NOT 回退显示 0 或空表。**403 特判**：配合 D4 的 fetch-visible-only，正常路径不应再发出无权限请求；若仍收到 403（权限键漂移等意外），防御性处理为隐藏该区且不计入错误横幅——权限拒绝是预期状态，不是系统故障。
- **加载态**：TableCard `:loading`（经 `v-bind="$attrs"` 透传 a-table 内置 loading）；首次加载统计卡容器半透明降交互；刷新时**保留旧数据**（stale-while-revalidate），仅按钮转「刷新中…」。
- **空态**：a-empty + 上下文 CTA（「还没有集群，去创建 →」链 `/clusters` 等），对齐 CentralList 句式；节点卡「全部检测通过」绿色横幅词汇保留。

### D4 权限过滤：与 AppSidebar 严格同源，不改路由守卫

`LinkItem` 扩展 `permission? / feature? / adminOnly?`，过滤谓词与 AppSidebar 完全一致（`!permission || authStore.hasPermission(...)` ∧ `!feature || featuresStore.has(...)` ∧ `!adminOnly || role==='admin'`）。StatCard 同理补 permission（clusters/nodes/upstreams/routes）。分组内全被过滤 → 整卡隐藏。键值映射（2026-10-10 从 AppSidebar 逐项核实，实施时若侧边栏有变以其为准）：

| 入口 | permission | feature | adminOnly |
|---|---|---|---|
| /node-tasks | task_center | task_center | |
| /audit-log | audit_logs | audit_log | |
| /database-management | database_management | database_management | |
| /ansible-inventory | ansible_inventory | ansible_inventory | |
| /edge-autostart | edge_autostart | edge_autostart | |
| /edge-client | edge_nodes | edge_client | |
| /users | — | — | ✓ |
| /metrics/dashboard | metrics | metrics | |
| /plugin-configs | plugin_groups | — | — |
| /plugin-metadata | plugin_metadata | — | — |
| /global-rules | global_rules | — | — |
| /static-resources | static_resources | — | — |
| StatCard /clusters /nodes /upstreams /routes | clusters / nodes / upstreams / routes | — | — |
| 集群数据卡 | clusters | — | — |
| 节点数据卡（连通状态） | nodes | — | — |
| 最近路由卡 | routes | — | — |

**数据区显隐与请求联动（fetch-visible-only，评审确认 A）**：三张数据卡与 StatCard 同键门控——无 `clusters`/`nodes`/`routes` 权限的用户不渲染对应卡，且 `loadAll()` **不发起对应请求**（从源头消除 403 噪声与无谓流量）；空态 CTA（「还没有集群，去创建 →」）同样受对应权限约束，无权限时空态文案不带跳转链接。后端 403 一旦出现（防御路径）按 D3 特判为隐藏该区。权限键映射是快照，侧边栏增删菜单时须同步（tasks 5.3 防漂移测试钉住）。

路由守卫 `return '/'` 保留为兜底，不在本轮调整。

### D5 数据源分工：stats 是计数真源，listNodes 只供明细；节点摘要三态

`/dashboard/stats` 增加 `nodes_online`（`count(Node) where status==1`，与现有计数同款聚合）与 `nodes_untested`（`count where status==1 AND status_detail IS NULL`，评审确认 B）。摘要三态口径统一由 stats 派生：**失败 Y = nodes − nodes_online；未检测 Z = nodes_untested；通过 X = nodes_online − nodes_untested**。统计卡节点副标题与节点卡头部徽章统一取自该口径（未检测用中性灰徽章，与「通过」的绿、「失败」的红区分——把「未知」从「健康」里拆出来）；「全部 N 个节点上次检测通过」绿横幅仅在 未检测=0 且 失败=0 时显示。`listNodes({pageSize:500})` 降级为**失败节点明细来源**（需要 IP/端口/集群名，stats 无法提供）；分页上限用具名常量 `PAGE_SIZE_CARD_GRID`（约定 #54 = 500），达上限时明细区显示「节点数超过明细上限，失败清单可能不完整」（软措辞兜住恰好 500 的假阳性）。摘要与明细同源于 `Node.status` 列，口径天然一致。

### D6 手动刷新 + 「更新于」，不做自动轮询

加载编排抽 `loadAll()` 单点（含单请求粒度的 loadErrors 记录）。PageHeader `actions` 插槽（组件现成支持）放「更新于 HH:mm」muted 文本 + 「刷新」次要按钮；刷新期间按钮禁用显「刷新中…」，完成后更新时间戳（`formatMonthDayTime(new Date().toISOString())`，本机时间非后端数据，无 UTC 歧义）。**「更新于」在首次成功加载前不渲染**（从未成功即无真实时间可锚，宁可缺席不造假，评审确认 D①）。**in-flight 防并发守卫收敛在 `loadAll()` 单点**，统一覆盖头部「刷新」按钮与分区「重试」按钮（评审确认 D②）——任一入口触发时其余入口禁用，杜绝并发重复请求。刷新不清空旧数据（D3）。

### D7 node-card 收敛 TableCard 单实现

手写 node-card（card-header/footer 样式复制自 TableCard，已漂移）改用 TableCard 承载：列「节点地址（mono）/ 所属集群 / 检测结果」，仅列检测失败节点，body 区 `max-height` + 滚动（防离线清单无限撑高）。最近路由表新增「创建时间」列（`formatMonthDayTime`）并 `customRow` 点击跳 `/routes`——仅对具备 `routes` 权限的用户绑定点击与 hover 样式。`recentRoutes` / `clusterStatus` 去 `ref<any[]>`（复用 `types/index.ts` 的 Route 或本页局部 interface）。

### D8 高危入口用副标注，不用确认弹窗

「数据库管理」chip 加副标注「含恢复/迁移等高危操作」。不给导航 chip 加确认弹窗：弹窗会训练用户无视确认，真正的高危确认已在目标页内（迁移/恢复各自已有完整确认流）。分组语义重排：「快捷入口（运维操作）」= 节点任务中心 / 审计日志 / 数据库管理 / Ansible 主机清单 / 自启动管理 / Edge 直连 / 用户管理（自 moreLinks 移入）；「更多资源（配置与查询）」= 插件组 / 插件元数据 / 全局规则 / 静态资源 / 指标总览，chip 尾部追加 mono 计数徽章（消费 stats 闲置的 plugin_configs / plugin_metadata / global_rules / static_resources / users→用户管理所在组同理）。

### D9 后端零模型变更，不触 PG 冒烟强制项

`dashboard.py` 仅改响应 schema（`DashboardStatsResponse.nodes_online` / `nodes_untested`、`RecentRouteItem.created_at`）与三个只读 count 聚合；无新列、无 COLUMN_MIGRATIONS、无写路径 → 不触发约定 #31 的 PG 方言冒烟强制项（如实施中对查询有方言疑虑可自愿加跑）。

## Risks / Trade-offs

- **既有断言失效**：全仓现无任何 Dashboard 测试（前后端均已确认），无回归负担；但文案改动后需 grep 确认无其他测试/E2E 依赖「正常运行」「离线」等概览页字样。
- **nodes_online / nodes_untested 与明细口径漂移**：三者同读 `Node.status` / `Node.status_detail` 列，仅请求路径不同；测试需断言摘要（stats 派生）与明细（listNodes 过滤）数字一致性。
- **「未检测」判空启发式**：`status==1 AND status_detail IS NULL` 依赖「status_detail 仅由连通性测试等回写路径写入」的既有约定；若未来新增非检测语义的 status_detail 写入方，「未检测」口径需同步复核（写入路径集中在 clusters.py 测试端点与节点安装回写，风险可控）。
- **权限键与侧边栏漂移**：过滤键值是快照映射；侧边栏增删菜单时概览映射需同步——组件测试断言「概览键 ∈ 侧边栏键集合」防漂移（source 级断言可选，先用单测钉住映射表）。
- **created_at 时区**：naive UTC isoformat，前端必须走 `formatMonthDayTime`（约定 #26），禁止视图内 `new Date(t).toLocaleString()`。
- **受限账号验收依赖**：实机验证权限过滤需要非管理员账号；无现成账号时经用户管理临时创建，验收后处置由用户决定。
- **受限视角的既有数据口径不一致（9.4 实机验收发现，记录不修）**：非管理员 `/clusters` 按集群分配过滤（实测未分配用户 total=0），stats 与 recent-routes 为全局口径 → 受限用户可见「统计卡集群 6 vs 集群卡空态」「最近路由含不可见集群的路由」。fetch-visible-only 与 403 特判均正常工作（无错误横幅噪声）；该不一致属平台数据层口径（哪些接口该按分配收敛），超出本变更前端范围，已记入 proposal Non-Goals 作为后续立项候选。

## Migration Plan

无数据迁移。批次顺序 = 依赖顺序：后端契约（批次 1）先行 → 前端三态与语义（批次 2/3，纯前端不依赖后端新字段）→ 刷新（4）→ 权限过滤（5）→ 消费新字段（6/7）→ 打磨（8）→ 回归验收（9）。批次 2/3 与批次 1 可并行开工。
