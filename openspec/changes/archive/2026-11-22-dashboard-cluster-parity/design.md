# Design: dashboard-cluster-parity

## Context

设计基线（用户已逐轮批准）：
- `docs/ui/Live-Artifact-5/proposal-c/overview.html`（概览）
- `docs/ui/Live-Artifact-5/proposal-c/clusters.html`（集群管理）
- `docs/ui/Live-Artifact-5/proposal-c/central.html`（统一管理——ClusterCard 换装的参照卡面）

实现遵循 mockup-parity-standard 已确立的全站语言：卡片页 r14/r15 解剖、`#85` 筛选架构、`#86` 总数口径、`#87/#88` 分组/平铺与卡片页同构。

## Goals / Non-Goals

- Goals：两模块与 14 张卡片页视觉/交互统一；ClusterCard 保持两页共用单点；概览信息架构照设计页落地。
- Non-Goals：集群级发布失败聚合（D4 裁决：不立项）；概览数据接口/后端改动；统一管理页结构与交互变更（仅被动换装）。

## Decisions

### D1 · ClusterCard 单点重写（非页面内联）

`ClusterCard.vue` 是两页共用组件（#52 唯一实现）。重写为 l5-panel 解剖：
- 根节点 `article.l5-panel std-card` + `clusterHueClass(cluster.id)`（卡片页统一语言：band 左条/平铺左缘同源）；
- lp-head：`lp-name`（display_name 优先 + nameTitle tooltip）+ `lp-tag.tech`（标识 name，identTitle tooltip）+ `topbar-extra` slot（统一管理最大化按钮保留位置）；**不含组名**（分组头/band 承载，批 8 裁决延续）；
- lp-status：启用/禁用 badge（B4 术语）+ 配置版本 ps-tag（versionChip 三态语义与 tooltip 原样）+ routeBadge（页面传入）；
- lp-body：描述行 + 节点 chips 行（≤3 + off 圆点 + 「…还有 N 个」+ 右端 N/N 健康 lp-cnt 分级着色）；**无节点显示「未挂节点」占位**（行高恒定，#54 推论）；
- 离线警示 lp-notice（D5）：`N 个节点离线（IP:port 等），发布将跳过该节点`——由现有 cluster.nodes 派生，无后端改动；
- stat-grid 七格：statClick 接管（统一管理 openStatTab）/ router-link 深链（集群管理跳资源页）双分支，健康格 is-danger/is-warning 分级保留；
- lp-foot：**页面 slot 注入**（两页动作行：详情/连接测试/漂移检测/编辑/更多▾/删除，全部带边——用户 §919-§922 裁决），footer slot 保留。

契约不变：props `{cluster, routeBadge?, statClick?}`、slots `{topbar-extra, actions, footer}`。

### D2 · 集群管理页结构

- 工具条：`TableToolbar`（SearchInput 150 + 分组 select 104 + spacer；`show-count=false`——总数归 chips）+ `#mode-extra` 全部收起/展开 + 分组|平铺 seg（`useCardClusterGrouping`，`v-model:mode`）。
- 状态行：`.l5-chiprow` + `.f-chip.chip-status`（全部 N / 已启用 N / 已禁用 N，前端聚合；哨兵值语义对齐既有 statusFilter）。
- 网格：`card-grid l5-card mode-group/flat` + `ClusterBand`（name=分组名 / count-label=N 个集群 / secondary=`节点 N · 路由 N` 组内聚合 / hueClass=组内首个集群色相）+ `ClusterCard`（is-folded 联动折叠）。
- 平铺模式：band 隐藏，卡片自身即集群身份（无 strip 需求——与资源卡不同，集群卡本体就是实体）。
- 旧外壳退场：`.cl-header-actions`（SearchInput/form-input 分组/状态 select/共 N 个/全部展开·收起按钮）全部由新结构替代。

### D3 · 概览页结构（overview.html 落地）

- 页头：title「概览」+ ph-inline 徽标（`N 集群` lite-accent / `M 节点`，补充维度 #86——数字来自现有 stats 接口）+ `#actions` = 「更新于 MM/DD HH:mm」弱化文本（formatDateTime；加载完成时间戳，title 提示语义）+ 「刷新」btn-secondary（重新拉取全部分区并更新时间戳）。**无新建集群**（用户 §1279 裁决；冷启动由集群卡空态 CTA 承担）。
- 头部大数：4 张 `.dstat`（集群/节点/上游/路由）——集群色相左条（cluster-c1/c3/c5/c7）、mono 大数、副文案（节点卡 = `健康 N · 离线 M` 着色，复用现有健康数据源）；点击 router-link 到对应列表页（沿用 visibleStatCards 权限门控 canEnter）。
- 三列状态卡 `.dash-card`：集群表（名称+标识 / 启用徽标 / 健康比着色）、节点连通状态表（IP:端口 / 集群 / 检测通过·失败徽章；头部 Badge 语义沿用 BadgeStatus）、最近创建的路由表（名称 / URI mono 胶囊 / 发布四态徽标）；各卡头部「N 总数」徽标 + 「查看全部 →」router-link；空态/错误态沿用现有 loadErrors/retry 机制（403 防御静默隐藏不动）。
- 快捷入口 `.quick-card`：现实现 quickLinks 芯片原样迁移（permission/feature/adminOnly 门控保留）；资源类带 countKey 计数徽标；**运维操作类带 feature 运行态圆点**（featuresStore.has → 绿点；用户 §1276 批准的补充设计语言）。

### D4 · 数据边界（裁决记录）

- 集群卡「上次发布 1 个节点失败」error 提示：**不落地**——集群行无发布状态聚合（上游/路由发布不回写集群行，现有 versionChip 语义已明确该边界），补聚合需后端 schema/端点，超出本变更。
- 概览不新增任何数据端点；全部复用现有 stats/clusters/nodes/routes 接口与权限门控。

### D5 · 功能面不动

集群管理的新建/编辑/删除（含 showDeleteConfirm 流程）/连接测试/漂移检测/备份下载/从备份导入、统一管理的发布/版本/删除、概览的 403 权限防御/分区错误重试——全部保留，仅呈现层替换。

## Risks / Trade-offs

- ClusterCard 重写影响两页：契约不变 + 26 例组件测试重写钉住 + CentralList 相关测试回归兜底（#217 断言反转清单先行）。
- 概览三列卡在窄视口（<1200px）列数收缩：沿用 `.dash-cards` 网格断点（设计稿 3 列 → ≤1200 2 列 → ≤768 1 列，与 card-grid 同规范）。
- 「更新于」时间戳是分区级采样（各接口独立加载）：以全部关键分区就绪时刻为准，避免部分加载即更新造成误导。

## Migration Plan

1. ClusterCard 重写 + 组件测试（已完成，工作树待续）。
2. ClusterList 页结构替换 + 页面测试适配。
3. Dashboard 页结构替换 + 页面测试适配。
4. mockupParity 守卫新段（两页 + ClusterCard 单点红线）+ 全量回归 + 真机验收（1600 视口截图比对设计页）。
