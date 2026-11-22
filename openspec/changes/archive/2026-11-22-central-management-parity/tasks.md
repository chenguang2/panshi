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
- [x] 5.2 `openspec validate --all` 0 error 收口（✅ 222 通过 0 失败，2026-11-20 实测）；2026-11-22 用户验收后归档（sync specs + archive）

## 6. 设计页差异修复（parity 审计 r1，2026-11-21）

> 清单：`parity-audit-central-r1.md`（P0×2 / P1×8 / P2×4 / D×4）。批准前不动代码。

- [x] 6.1 逐项批准 parity 审计 r1（用户裁决「全部修复」+ D-4 提示条内联「连接测试」补进实现；D-3「直连」徽章按 3.4 从设计页删除）
- [x] 6.2 P0-1 发布状态胶囊：`.ps-tag/.ps-pub/.ps-unpub` 下沉 `style.css`（PublishStatusTag 与 ClusterCard 共用），卡片状态恢复胶囊（实测 11px/600 mono、20px、12% 淡底）
- [x] 6.3 P0-2 离线提示条：去掉 `alert alert-warning`、移出 `.lp-body`（宽度回 385.3）、新增 `.lp-notice.warn` 语义色；内联「连接测试」`.n-act` + `emit('test')`，两页绑定 `testCluster`
- [x] 6.4 P1 最大化面板外壳：mini-bar（--bg/双线/10·16）、mini-item（999 胶囊/active 淡 accent）、mini-hint（10.5 mono）、「× 收起」`.btn-ghost` 解剖
- [x] 6.5 P1 页签条：7 页签补 13px 线性图标、active 2px accent 上边 + accent 淡底、`.db` 计数胶囊（mono + 1px 边）
- [x] 6.6 P1 名称行：动作按钮去 `btn-sm`（13px/6·14，高 28 保留）、`chint` 去括号
- [x] 6.7 P2：统计格满健康绿（`statHealthCls.is-ok`）、启用胶囊 `.badge` 对齐 `.ps-tag` 解剖、页头图标（`StrokeIcon` 增 `download/plus`，统一管理 + 集群管理两页）、`PageHeader` 居中
- [x] 6.8 D 项：设计页 `central.html` 补「刷新」与「最大化」chip、删「直连」徽章（最大化徽章改按数据动态显示）
- [x] 6.9 回归：`ClusterCard/CentralList/CentralList.statTab/CentralList.source/mockupParity` 159 例绿；全量 `vitest --maxWorkers=4` 3096 passed / 1 flake（NodeList 列拖拽，隔离复跑 72/72 绿，判定 #58 波动）；`vue-tsc -b` 干净；同一审计脚本复测，18 项全 ✓（剩余 7 项判定非缺陷，见审计文档「六、修复与复测」）


## 7. 最大化面板 Tab 外观对齐（parity 审计 max-r2，2026-11-21）

> 清单与逐页对照：`parity-audit-max-r2.md`。用户裁决：先做批次 A（外观）+ 行内动作收敛 + 工具栏补图标 + 恢复「删除 N」+ 首列「勾选 + 序号」并存；菜单与勾选关系按现状；菜单顺序统一到 #81；1280 上游表内横滚接受。

- [x] 7.1 面板 CSS 单点（`style.css` 的 `.max-panel .dbody` 段）：工具条 `.tool-btn` 30px 浅底、表头灰底去大写 9×12、单元格 10×12、行 hover 4%、选择列 40、`.op-pub.op-ghost`、`.action-trigger-btn` 26×24、`.l5-pager` 无上边框
- [x] 7.2 表格三 Tab：`scroll.x` 数值最小宽（节点 1076 / 上游 1054 / 路由 1036，去 `max-content`）、`#` 序号列（勾选列之后、跨页连续）、`ListPager` 外置分页（个节点/个上游/条路由）、列配置移右端
- [x] 7.3 行内动作收敛：节点「重载 + 状态 + ⋯」、上游/路由「发布 + ⋯」；菜单三栏（CRUD → 删除(红) → 版本管理）；节点保留动作勾选配置（编辑/复制/删除/数据库对比 恒驻，启动/停止 跟勾选）；列宽 actions 340→120（上游）/110（路由）
- [x] 7.4 工具栏：补 StrokeIcon（plus / play / pause / rotate / chevronDown），routes/upstreams 恢复「删除 X(N)」（未选禁用），其余重复动作保持移除
- [x] 7.5 卡片四 Tab：卡脚改文字按钮（查看/编辑/删除/发布/版本管理），发布 `.op-pub`、删除红字、上缘分隔线；静态资源卡脚折行成组；`PluginMetadata` 卡内「添加」去 antd 自动空格
- [x] 7.8 批次 B 补列（用户裁决「只补列」）：集群节点默认列加「Edge安装路径」（220，ellipsis）、路由默认列加「方法」（110，胶囊，前 2 枚 + title 全量）与「描述」（200，ellipsis）；默认列序对齐设计（名称/URI/方法/优先级/发布状态/描述/操作）
- [x] 7.6 独立列表页 `RouteList` / `UpstreamList` 菜单顺序统一到 #81（复制/编辑 → 删除(红+解释) → 版本管理），加源码守卫防回退
- [x] 7.7 验证：面板内计算值逐项对齐（td 10×12、卡脚 30/发布 24、上游无溢出）；`clusters` 套 + CentralList + mockupParity + pageHeaderActions 426 例绿；`vue-tsc -b` 干净；全量 vitest 仅未改动文件波动（隔离复绿）

## 8. 最大化面板集群切换动效（方案 A，2026-11-21）

> 规格由 @designer 产出、用户选定 A（方向滑入）。实现修正：**不用 `:key` 重挂载**（会丢子组件状态并重复请求），改为「类切换 + 强制重排」重播。

- [x] 8.1 规格确认：内容区 `translate3d(±22px)` + 淡入 200ms `cubic-bezier(0.22,1,0.36,1)`；方向按 `filteredClusters` 下标（首尾不循环）；名称行 `.max-ident` 180ms 上浮 6px；胶囊过渡 160ms；色相条 240ms
- [x] 8.2 实现：`.max-swap` 包裹 7 个 Tab 分支（无 key）+ `swapKind/swapDir/swapOn` 重播；`switchTab` 用 `fx-tab`（140ms 纯淡入）；首次进入播 `fx-cluster`
- [x] 8.3 降级：`prefers-reduced-motion: reduce` → 仅 90ms 淡入，无位移；列表刷新不重播
- [x] 8.4 守卫与验收：源码断言（无 `:key`、关键帧存在、reduced-motion 块、动效块无布局属性）+ 真机 animationName/duration、无横向滚动、三张截图
