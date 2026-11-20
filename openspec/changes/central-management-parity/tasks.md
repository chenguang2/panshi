# Tasks: central-management-parity

> 前置：dashboard-cluster-parity 批先提交（design 风险条——避免两批未提交变更混叠回归归属）。

## 1. 断言反转清单（#217，动模板前产出）

- [x] 1.1 盘点 `CentralList.test.ts` / `CentralList.statTab.test.ts` 对旧壳（`.cl-header-actions`、状态下拉 option、`.group-head`、`.cluster-name-item`、`.expanded-area`）的全部断言，产出「旧断言 → 新结构断言」映射清单（文件内注释或表格均可，随本变更目录留存）——已随用例改写内嵌注释；旧壳断言共 2 用例（批 7 分组筛选）+ statTab 6 处 `.card-expanded` 选择器
- [x] 1.2 确认 `mockupParity.source.test.ts` 现有统一管理段（916-936 区域）不与新红线冲突，规划新增用例清单——现有段仅钉 CaCert/ServerCert（TableToolbar/ClusterBand/useCardClusterGrouping 存在性），与新红线（网格态同构 + 死代码不残留）不冲突

## 2. 网格态换壳（对齐 central.html 状态一）

- [x] 2.1 单面板 + 工具条：`<div class="l5-card cm-card-page">` 包裹 TableToolbar（SearchInput 150 + 分组 l5-select 104 + `#mode-extra` 全部收起/展开单按钮 + `v-model:mode` seg）+ `.l5-chiprow`（全部/已启用/已禁用 三 chips 接 statusFilter；删除旧状态下拉）
- [x] 2.2 分组迁移：自有 `groupedClusters`/`expandedGroups` → `useCardClusterGrouping`（clusterIdOf = 组伪 id 未分组置顶；secondary = 组内聚合「节点 N · 路由 N」）+ `renderGroups` 单循环 + `ClusterBand`；删除分组/未分组双分支模板与 `.cluster-name-item` 快捷小条
- [x] 2.3 平铺模式接通（mode-flat：band 隐藏、卡片全量平铺）+ 空态/加载态迁入面板
- [x] 2.4 页头 ph-lite 徽标（`N 集群` accent / `M 节点`，PageStatBadges #stats 槽）
- [x] 2.5 旧壳 scoped 样式删除（`.cl-header-actions` 含媒体查询变体/`.group-*`/`.cluster-name*`/`.status-dot-sm`/旧折叠图标等）

## 3. 两态收口（对齐 central.html 状态二）

- [x] 3.1 删除 `toggleExpand`/`expandAndSwitchTab`/`expandedIds`/`expandedOrder` 死代码与 `.expanded-area` 循环 + `.expanded-mini-row` 非最大化分支 + 无模板绑定的拖拽排序机器（`draggedClusterId` ×4 handler）；最大化面板改 `v-else-if="maximizedCluster"` 直渲染（maximizeCluster/restoreMaximize/switchMaximizedCluster/刷新保持逻辑不动）
- [x] 3.2 面板解剖对齐：容器 `max-panel` + `clusterHueClass(cluster.id)` + `data-cluster-id` 锚点；名称行 `max-name-row`（cname 16/700 + chint mono + 中继徽章镜像 + 既有动作行）；dtabs/mini-bar 原样复核
- [x] 3.3 `loadClusters`（CLUSTER_RUNTIME_KEYS 按 id 保留运行态）与 `onClusterSaved`→loadClusters 链路零改动复核（回归 `ClusterEditRefresh.source.test.ts` 绿）

## 4. 守卫与测试收口

- [x] 4.1 断言反转落地：`CentralList.test.ts`（批 7 两用例改写 + 新增网格态外壳同构用例）/ `CentralList.statTab.test.ts`（6 处 `.card-expanded` → `.max-panel[data-cluster-id]`）；statClick→openStatTab 直达语义保持绿
- [x] 4.2 `mockupParity.source.test.ts` 新增统一管理同构红线段（4 用例：网格态结构/旧壳死代码不残留/最大化面板/功能面保持）；`CardPagePanelContainment.source.test.ts` CASES 增 `CentralList.vue`
- [x] 4.3 全量 vitest（`--maxWorkers=2`）+ `npx vue-tsc -b` 干净 + 连接测试 describe 波动定性（失败集轮换 + 隔离复跑绿 + 13 连绿，#58 家族；HEAD 对照 3× 绿）
- [x] 4.4 真机验收（1600 视口）：分组/平铺两态、chips 计数与筛选、统计格直达对应 Tab、卡头最大化、mini-bar 切换保 Tab、✕ 收起返回网格（折叠/筛选保持）、编辑保存后徽标即时刷新、发布成功局部刷新（其他 Tab 数据不丢）；设计页对照截图存档——10/10 PASS（截图 /tmp/opencode/bug-cluster-status/cm-final-grid.png）；发布成功局部刷新项经组件套件「刷新保状态」用例覆盖（CentralList.test.ts 19 例行为面全绿）
  - 实施补遗：mini-bar 切换「保留当前 Tab」为设计页承诺但旧实现缺失（切新集群回落节点 Tab）——已补 switchMaximizedCluster 携带当前 Tab 并触发按需加载，验收第 7 项实测「上游 → 上游」保持
  - 波动记录：连接测试 describe 一度出现失败集轮换（route=relay/direct 轮换），隔离复跑绿 + 13 连绿 + HEAD 对照绿 → #58 家族热机波动，非回归；全量跑中 PluginMetadata.delete 同族 1 例隔离复绿

## 5. 收口归档

- [x] 5.1 手册截图核对：`manual-screenshots.mjs` SHOTS 清单无统一管理（/central-management）条目——无既有截图需重拍（新增手册章节属范围外，未立项）
- [ ] 5.2 `openspec validate --all` 0 error 收口（✅ 222 通过 0 失败，2026-11-20 实测）；等待用户验收后归档（sync specs + archive）

