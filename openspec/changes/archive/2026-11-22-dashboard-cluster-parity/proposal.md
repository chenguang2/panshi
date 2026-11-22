# Proposal: dashboard-cluster-parity

## Why

mockup-parity-standard（已归档）收敛了全部列表页与卡片页的设计语言，但「概览」与「集群管理」两个入口模块仍是旧形态（ClusterCard 旧解剖 / Dashboard 旧统计卡布局），与已推广的 14 张卡片页视觉断层；且设计页 `overview.html`、`clusters.html` 已在本会话经用户逐轮批准（含页头动作、更新于时间戳、统计格语言、动作行卡脚等裁决），具备直接落地的完整基线。

## What Changes

- **ClusterCard 单点重写**（共享组件，两页共用）：l5-panel 解剖——lp-head（显示名 + 标识 tech tag + topbar-extra slot）/ lp-status（启用徽标 + 配置版本 ps-tag + 中继徽章）/ lp-body（描述 + 节点 chips + 健康比）/ stat-grid 七格（色相分域，statClick / router-link 双分支）/ lp-foot（页面 slot 注入动作行）。props/slots 契约不变（#52）。
- **集群管理页（ClusterList）**：TableToolbar（搜索150/分组104 + 全部收起 + 分组|平铺 seg）+ 状态 chips（全部/已启用/已禁用，#85①）+ `useCardClusterGrouping` 分组 band（组级次要指标 = 节点 N · 路由 N）+ 集群色相 `clusterHueClass`；功能面（新建/编辑/删除/连接测试/漂移检测/备份下载/导入）不动。
- **概览页（Dashboard）**：页头（ph-lite 补充维度 + 「更新于 HH:mm」采样时间戳 + 刷新按钮；无新建集群——用户裁决）+ 4 张大数统计卡（集群色相左条、可点直达）+ 三列状态卡（集群 / 节点连通状态 / 最近创建的路由，数据复用现有接口）+ 快捷入口 chips（资源类带 countKey 计数；运维类带 feature 运行态圆点）。
- **派生影响**：统一管理页（CentralList）因 ClusterCard 换装同帧获得新卡面（foot 动作行/统计格新样式），交互契约不变。

## Capabilities

### New Capabilities

- `overview-page`：概览仪表页的信息架构与呈现契约（大数统计卡 / 三列状态卡 / 快捷入口 / 新鲜度时间戳）。
- `cluster-card-anatomy`：集群卡片（两页共用单点）的 l5-panel 解剖与统计格分域契约。

### Modified Capabilities

- `card-page-standard`（若主 specs 中已有卡片页解剖 spec，则合并本次集群卡差异；否则随 cluster-card-anatomy 单列）。

## Impact

- 前端：`components/ClusterCard.vue`（重写）、`views/ClusterList.vue`、`views/Dashboard.vue`、`views/CentralList.vue`（只被换装影响，不改契约）。
- 测试：`ClusterCard.test.ts`（已重写 26 例）、`ClusterListPage.test.ts`、`Dashboard.test.ts`、`mockupParity.source.test.ts` 新段。
- 后端：无 schema/端点变更（集群级发布失败聚合提示**不立项**，用户裁决范围外；集群卡离线警示由现有 nodes 数据派生）。
