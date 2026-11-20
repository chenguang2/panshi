# Tasks: central-management-parity

> 前置：dashboard-cluster-parity 批先提交（design 风险条——避免两批未提交变更混叠回归归属）。

## 1. 断言反转清单（#217，动模板前产出）

- [ ] 1.1 盘点 `CentralList.test.ts` / `CentralList.statTab.test.ts` 对旧壳（`.cl-header-actions`、状态下拉 option、`.group-head`、`.cluster-name-item`、`.expanded-area`）的全部断言，产出「旧断言 → 新结构断言」映射清单（文件内注释或表格均可，随本变更目录留存）
- [ ] 1.2 确认 `mockupParity.source.test.ts` 现有统一管理段（916-936 区域）不与新红线冲突，规划新增用例清单

## 2. 网格态换壳（对齐 central.html 状态一）

- [ ] 2.1 单面板 + 工具条：`<div class="l5-card cm-card-page">` 包裹 TableToolbar（SearchInput 150 + 分组 l5-select 104 + `#mode-extra` 全部收起/展开单按钮 + `v-model:mode` seg）+ `.l5-chiprow`（全部/已启用/已禁用 三 chips 接 statusFilter；删除旧状态下拉）
- [ ] 2.2 分组迁移：自有 `groupedClusters`/`expandedGroups` → `useCardClusterGrouping`（clusterIdOf = 组伪 id 未分组置顶；secondary = 组内聚合「节点 N · 路由 N」）+ `renderGroups` 单循环 + `ClusterBand`；删除分组/未分组双分支模板与 `.cluster-name-item` 快捷小条
- [ ] 2.3 平铺模式接通（mode-flat：band 隐藏、卡片全量平铺）+ 空态/加载态迁入面板
- [ ] 2.4 页头 ph-lite 徽标（`N 集群` accent / `M 节点`，数据来自 clusters 聚合）
- [ ] 2.5 旧壳 scoped 样式删除（`.cl-header-actions`/`.group-head`/`.cluster-name-item`/旧折叠图标等）

## 3. 两态收口（对齐 central.html 状态二）

- [ ] 3.1 删除 `toggleExpand`/`expandedIds`/`expandedOrder` 死代码与 `.expanded-area` 循环 + `.expanded-mini-row` 非最大化分支；最大化面板改 `v-if="maximizedClusterId"` 直渲染（maximizeCluster/restoreMaximize/switchMaximizedCluster/刷新保持逻辑不动）
- [ ] 3.2 面板解剖对齐：容器 `max-panel` + `clusterHueClass(cluster.id)`；名称行 `max-name-row`（cname/chint/中继徽章 + 既有动作行）；dtabs/mini-bar 原样复核
- [ ] 3.3 `loadClusters`（CLUSTER_RUNTIME_KEYS 按 id 保留运行态）与 `onClusterSaved`→loadClusters 链路零改动复核（回归 `ClusterEditRefresh.source.test.ts`）

## 4. 守卫与测试收口

- [ ] 4.1 断言反转落地：`CentralList.test.ts` / `CentralList.statTab.test.ts` 按清单改写（a-table 桩沿用 helpers；statClick→openStatTab 直达语义保持绿）
- [ ] 4.2 `mockupParity.source.test.ts` 新增统一管理同构红线段；`CardPagePanelContainment.source.test.ts` CASES 增 `CentralList.vue`
- [ ] 4.3 全量 vitest（`--maxWorkers=4`，#58 波动定性法：失败集逐轮轮换 + 隔离复跑全绿）+ `npx vue-tsc -b` + `openspec validate --all`
- [ ] 4.4 真机验收（1600 视口）：分组/平铺两态、chips 计数与筛选、统计格直达对应 Tab、卡头最大化、mini-bar 切换保 Tab、✕ 收起返回网格（折叠/筛选保持）、编辑保存后徽标即时刷新、发布成功局部刷新（其他 Tab 数据不丢）；设计页对照截图存档

## 5. 收口归档

- [ ] 5.1 手册截图重拍核对（`manual-screenshots.mjs` 中统一管理相关 SHOTS，名称精确全匹配——AGENTS #63）
- [ ] 5.2 `openspec validate --all` 0 error 收口；等待用户验收后归档（sync specs + archive）
