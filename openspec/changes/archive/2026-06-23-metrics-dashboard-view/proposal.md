## Why

当前指标监控页面每次只能查看一个指标（单指标查询模式），运维人员无法一眼看到所有关键指标的实时趋势。需要新增一个 Grafana 风格的多图仪表盘页面，将 QPS、连接数、错误率、共享字典使用率等关键指标同时展示在一个页面上。

## What Changes

- 新增 `/metrics/dashboard` 路由和页面，以 2 列网格布局同时展示多个指标图表
- 侧边栏"指标监控"改为可展开的父菜单，包含子菜单"查询分析"（现有单指标页面）和"仪表盘"（新增）
- 仪表盘页面顶部提供全局控制：时间范围选择、刷新间隔选择、自动刷新开关
- 默认展示业务指标（QPS、活跃连接数、错误率），基础设施指标折叠在"更多指标"区域
- 复用现有 `/api/v1/metrics/{metric_name}` API，前端并发查询多个指标
- 单个指标图表支持鼠标悬停 tooltip 显示详情

## Capabilities

### New Capabilities
- `metrics-dashboard`: Edge 节点指标的 Grafana 风格多图仪表盘展示

### Modified Capabilities

- `clickhouse-metrics-query`: 侧边栏菜单结构发生变化（单条目 → 父子菜单）；现有单指标查询页面功能不变

## Impact

- **前端新增**: `frontend/src/views/MetricsDashboard.vue` — 仪表盘主页面
- **前端新增**: `frontend/src/stores/metricsDashboard.ts` — 仪表盘专用 store（并发加载）
- **前端修改**: `frontend/src/views/Metrics.vue` — 保持不变（现有单指标页面）
- **前端修改**: `frontend/src/components/AppSidebar.vue` — "指标监控"改为父子菜单结构
- **前端修改**: `frontend/src/router/index.ts` — 添加 `/metrics/dashboard` 路由
- **前端修改**: `frontend/src/views/DefaultLayout.vue` — 添加仪表盘页面的面包屑映射
- **后端**: 无修改（复用现有 API）
