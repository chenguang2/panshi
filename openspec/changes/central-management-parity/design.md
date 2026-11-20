# Design: central-management-parity

## Context

设计基线（用户已逐轮批准）：`docs/ui/Live-Artifact-5/proposal-c/central.html`（两态模型：状态一 单面板卡片网格 / 状态二 最大化面板）。实现遵循 mockup-parity-standard 已确立的全站语言：#85 筛选架构、#86 总数口径、#87/#88 分组平铺与卡片页同构；前置变更 dashboard-cluster-parity（本工作树已完成待提交）已换装 ClusterCard（本页被动获得新卡面，statClick/动作行 slot 已接通）。

当前 CentralList.vue（约 1450 行）的网格态仍持旧壳：`.cl-header-actions`（SearchInput + form-input 分组/状态下拉 + 共 N 个 + 全部展开/收起双按钮）、`.group-head` 旧分组头（内嵌 `.cluster-name-item` 点击直达最大化的快捷小条）、分组/未分组两段近同构模板（v-if/v-else 双分支）、自有 `groupedClusters`/`expandedGroups` 分组态。最大化机制存在但夹带不可达死代码：`toggleExpand`（无模板消费点，#79 记录）、`.expanded-area`/`expanded-mini-row` 的非最大化分支（expandedIds 仅由 maximizeCluster 写入单集群）。

## Goals / Non-Goals

- Goals：网格态换壳对齐卡片页标准与 central.html；两态模型收口（死代码退场）；功能与编排链路零回归。
- Non-Goals：七 Tab 子表内部形态（cluster-tab-column-personalization 已交付，不动）；ClusterCard 解剖（dashboard-cluster-parity 已交付，不动）；后端任何改动（ph-lite 徽标复用 /clusters 聚合返回，无新端点）；Tab 内迷你卡片形态（mini 卡片页标准另行推广）。

## Decisions

### D1 · 网格态结构（对齐 central.html 状态一）

- 单面板：`<div class="l5-card cm-card-page">` 包裹 TableToolbar → `.l5-chiprow` → 卡片网格；网格去自带框、走共享 `.l5-card > .card-grid:not(.l5-card)` 内距规则（本轮集群管理三页修复已建立的机制，`CardPagePanelContainment.source.test.ts` 纳入本页断言）。
- 工具条：`TableToolbar`（`v-model:mode`，`#filters` = SearchInput 150 + 分组 l5-select 104；`#mode-extra` = 分组态「全部收起/展开」单按钮）；`show-count=false`（总数归 chips「全部 N」）。
- 状态行：`.l5-chiprow` 三 chips（全部/已启用/已禁用），前端聚合自 filteredClusters（全量 ≤500，无后端聚合端点——与集群管理同款口径；`statusFilter` 哨兵值沿用）。
- 分组：迁移至共享 `useCardClusterGrouping`（替换自有 groupedClusters/expandedGroups）：`clusterIdOf` = 组伪 id（未分组置顶 + 字母序，同集群管理 D2）、`secondary` = 组内聚合「节点 N · 路由 N」；`renderGroups` 单循环驱动（分组/未分组双分支模板收敛删除）。
- 平铺模式：`mode-flat` 时 band 隐藏、卡片全量平铺——引入本页此前没有的平铺态（设计页 seg 即含此态）。
- 页头：`PageHeader` 补 ph-lite 徽标（`N 集群` lite-accent / `M 节点`；数据 = clusters.length 与 Σnode_count）。

### D2 · 最大化入口与两态收口（对齐 central.html 状态二）

- 入口保持两处：统计格 `openStatTab`（最大化 + 直达对应 Tab）与卡头 `#topbar-extra`「最大化」按钮（最大化 + 默认 Tab）。设计页交互注记的「卡脚『统一管理』按钮」与设计页实际卡脚标记（六按钮无此项）不一致——**按设计页实际标记裁决**：不新增卡脚按钮，入口不变。
- 组头 `.cluster-name-item` 快捷小条随旧分组头退场（设计 band 不含；最大化入口已有两处，且 chips/卡面已承载全部状态信息）。
- 模板收敛：`.expanded-area` TransitionGroup 循环 + `.expanded-mini-row` 非最大化分支 + `toggleExpand`/`expandedIds`/`expandedOrder` 死代码删除；最大化面板改为 `v-if="maximizedClusterId"` 直渲染单集群面板（`maximizeCluster`/`restoreMaximize`/`switchMaximizedCluster`/刷新保持逻辑原样，仅承载容器简化）。
- 面板解剖对齐：容器 `max-panel` + 集群色相（`clusterHueClass`）；名称行 `max-name-row`（cname + chint + 中继徽章 + 动作行，动作集与现 expanded-name-row 一致：详情/连接测试/编辑/导出 Excel/备份下载/删除）；dtabs 七页签 + 计数徽标原样（已是设计同款）。mini-bar（紧凑切换条）原样保留。

### D3 · 状态与编排保留（零行为回归红线）

- 筛选态：`filterText`/`groupFilter`/`statusFilter` 语义不变；清空/深链 query 参数（`editClusterId` 等）处理不变。
- 最大化运行态：`maximizedClusterId`、`CLUSTER_RUNTIME_KEYS`（#203 局部刷新：activeTab/nodes/upstreams/routes/plugin_configs/global_rules…）随 loadClusters 重建保留——**loadClusters 的按 id 保留运行态逻辑不动**（本设计的分组态迁移不触碰该函数）。
- 保存链路：`ClusterFormModal @saved → onClusterSaved → loadClusters`（`ClusterEditRefresh.source.test.ts` 钉住，回归必跑）。
- 发布/版本/删除编排、连接测试、漂移检测、备份双入口：原样。

### D4 · 测试策略（#217 断言反转清单先行）

改版前先产断言反转清单（现有 CentralList.test.ts / CentralList.statTab.test.ts 对旧壳的断言 → 新结构断言的映射表），再动模板：
- `CentralList.test.ts`：旧壳选择器（`.cl-header-actions`、状态下拉 option、`.group-head`、`.cluster-name-item`）断言反转；新增 chips/seg/单面板断言（a-table 桩沿用 `__tests__/helpers/aTableStub.ts`，jsdom 无 matchMedia——#54）。
- `CentralList.statTab.test.ts`：statClick → openStatTab 直达语义不变（应保持绿，若有旧壳选择器需反转）。
- `mockupParity.source.test.ts` 新段：统一管理卡片页同构红线（TableToolbar/chiprow/seg/ClusterBand/单面板包含/旧壳不残留）。
- `CardPagePanelContainment.source.test.ts`：CASES 增 `CentralList.vue`（含 chips，`gridHook='cluster-grid card-grid'`……模板收敛后 grid hook 以实现为准，任务中定）。
- 回归：`ClusterEditRefresh.source.test.ts` + 组件级 vitest（--maxWorkers=4，失败集逐轮轮换 + 隔离复跑全绿 = #58 波动定性法）+ `vue-tsc -b` + `openspec validate --all`。
- 真机验收（#82 五步法减略版——设计页为既有批准基线，验收 = 实现页与设计页同数据对照）：分组/平铺两态、chips 计数、最大化直达 Tab、mini-bar 切换保 Tab、收起返回、发布成功局部刷新。

### D5 · 样式落点

- 网格态样式全部复用共享单点（style.css `.l5-*`/`.card-grid`/`.lp-*`）；页面 scoped 仅保留 mini-bar、max-panel/max-name-row、dtabs 页签条等本页特有规则（central.html 27-49 行注释标注「与实现侧同语义」的既有规则照抄，不重发明）。
- 旧壳 scoped 样式（`.cl-header-actions`/`.group-head`/`.cluster-name-item`/`.expanded-mini-row` 等）随模板删除。

## Risks / Trade-offs

- 分组态迁移（自有实现 → useCardClusterGrouping）是行为等价重构：折叠语义（默认全展开 + 逐组折叠）与「未分组置顶」必须逐项对照旧实现验证（旧 expandedGroups 缺省 undefined 视为展开——新 composable 需同语义）。
- 删除 `.cluster-name-item` 快捷小条移除一个现存交互入口（组头点击直达最大化）——用户可从统计格/卡头两处进入，信息无损；如用户验收时要求保留，可在 band 右缘以 chip 形式复活（本变更不做）。
- 两态收口删除 `.expanded-area` 承载壳：`TransitionGroup` 进出场动画路径改变（maximized 直渲染），需真机确认进出无闪烁。
- 与 dashboard-cluster-parity 同工作树叠改：其 tasks 已全勾、全量回归已过；本变更基线 = 其完成态，落地前该批先提交（避免两批未提交变更混叠回归归属）。
