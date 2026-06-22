## 1. 仪表盘 Store

- [x] 1.1 创建 `frontend/src/stores/metricsDashboard.ts` — 仪表盘专用 Pinia store（并发加载多个指标、全局时间/刷新控制、自动刷新逻辑）

## 2. 仪表盘页面

- [x] 2.1 创建 `frontend/src/views/MetricsDashboard.vue` — 页面结构：
  - 全局控制栏（时间范围 radio group、刷新间隔 60s/120s/300s 选择、自动刷新开关、手动刷新按钮）
  - 2 列 CSS Grid 布局的业务指标图表（QPS → edge_http_requests_total rate、活跃连接数 → label=state:active、采集错误率 → edge_metric_errors rate）
  - 每个图表卡片包含：ECharts sparkline 折线图 + 当前值标注（取最后一个数据点）+ 空数据状态
  - 折叠区域"更多指标"（edge_shared_dict_capacity_bytes、edge_shared_dict_free_space_bytes、scrape_*、up）
  - Promise.allSettled 并发加载（不限制并发数）
- [x] 2.2 实现图表卡片组件 `frontend/src/components/MetricChartCard.vue`（可复用的单个图表卡片：标题 + ECharts + 当前值 + tooltip）

## 3. 菜单与路由调整

- [x] 3.1 在 `frontend/src/router/index.ts` 的 featureRouteMap 中调整 metrics 路由为数组（`/metrics` + `/metrics/dashboard`）；setupDynamicRoutes 支持数组值
- [x] 3.2 修改 `frontend/src/components/AppSidebar.vue`：
  - "指标监控"从单一条目改为父菜单（nav-group 展开/折叠）
  - 子菜单："查询分析" → `/metrics`，"仪表盘" → `/metrics/dashboard`
  - 使用 featuresStore.has('metrics') 控制显隐
- [x] 3.3 修改 `frontend/src/views/DefaultLayout.vue` — 添加 MetricsDashboard 的面包屑和页面名映射

## 4. 验证与测试

- [x] 4.1 验证 TypeScript 编译（vue-tsc --noEmit 退出码 0）
- [x] 4.2 验证仪表盘 store 测试通过（6/6 Vitest 测试）
- [x] 4.3 验证子菜单导航正常（setupDynamicRoutes 注册两个路由）
- [x] 4.4 验证 feature 开关控制（featuresStore.has('metrics') 条件渲染）
