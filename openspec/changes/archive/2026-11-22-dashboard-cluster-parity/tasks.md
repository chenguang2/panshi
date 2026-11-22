# Tasks: dashboard-cluster-parity

## 1. ClusterCard 单点重写（已完成，工作树待续）

- [x] 1.1 l5-panel 解剖重写（lp-head/lp-status/lp-body/stat-grid/lp-foot；props/slots 契约不变；离线警示由 nodes 派生）
- [x] 1.2 组件测试重写 26 例（解剖/身份/徽章/统计双分支/节点 chips/离线警示/健康分级；断言反转清单钉住旧外壳退场）
- [x] 1.3 已修复（组名断言误伤显示名子串——改为钉住无 group tag）+ ClusterCard 26/26 绿；CentralList 契约面（props/slots）不变

## 2. 集群管理页（ClusterList）✅

- [x] 2.1 工具条 + 状态 chips：TableToolbar（搜索150/分组104/show-count=false）+ `.l5-chiprow`（全部/已启用/已禁用，点击筛选接 statusFilter）
- [x] 2.2 分组|平铺：`useCardClusterGrouping`（unit 个集群；secondary = 节点 N · 路由 N 组内聚合）+ ClusterBand + `is-folded` 联动；全部收起/展开按钮
- [x] 2.3 旧外壳退场：`.cl-header-actions`（旧 select/计数/折叠按钮）删除；空态两分支保留
- [x] 2.4 页面测试适配（ClusterListPage.test.ts 断言反转：旧外壳选择器 → 新结构）

## 3. 概览页（Dashboard）✅

- [x] 3.1 页头：ph-lite 补充维度（集群/节点数）+「更新于」时间戳（分区全部就绪时刻；formatDateTime）+ 刷新按钮；移除新建集群
- [x] 3.2 大数统计 4 卡（dstat：色相左条/mono 大数/节点健康副文案；router-link 直达；canEnter 门控保留）
- [x] 3.3 三列状态卡（集群/节点连通状态/最近路由；dc-head 徽标 + 查看全部深链；空/错/加载态沿用）
- [x] 3.4 快捷入口 quick-card（quickLinks 门控原样；countKey 计数；运维类 feature 圆点）
- [x] 3.5 页面测试适配（Dashboard.test.ts 断言反转）

## 4. 守卫与收口

- [x] 4.1 mockupParity 新段：概览页结构红线 + ClusterList 卡片页同构 + ClusterCard 解剖单点
- [x] 4.2 全量回归（`--maxWorkers=2` 全绿 3083/3083；`--maxWorkers=4` 失败集逐轮轮换、隔离复跑全绿 = #58 波动）+ `vue-tsc -b` 干净 + `openspec validate --all` 收口
- [x] 4.3 真机验收（1600 视口，无 console 错误）：概览（/tmp/opencode/dash-final.png——大数 4 卡色相左条/健康比着色/三列状态卡 0 截断/快捷入口 12 芯片含计数与 feature 圆点/更新于 21:35）；集群管理（/tmp/opencode/cl-batch2.png + cl-flat.png——5 band/11 卡/状态 chips/平铺左缘色条/离线警示）；统一管理被动换装复核通过（统计格/卡面照常，21/21）。
  附带清理：StatCard/TableCard 旧组件引用归零后删除（含各自组件测试，#46 全仓引用数 0 判据）；ClusterList 旧 `.cl-header-actions` 样式残留清除；Dashboard 移除 routeRowAttrs（行点击由「查看全部路由」头链承载，设计稿裁决）；`/dashboard/recent-routes` 增加 `current_version` 只读字段（Route 既有列，无迁移；「待发布」依赖 published_at 回查不引入——以列表页为准，设计三态在该卡为 vN/未发布）
