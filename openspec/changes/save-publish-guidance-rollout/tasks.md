# Tasks

> 实施已完成（2026-11-13，先实施后补档——机制与文案全部沿用既有裁决 route-save-publish-guidance / save-feedback-single-channel，用户裁决「直接逐批改」）。

- [x] 1. 批 1 插件组：共享 `PluginEntityFormModal`（withPublishGuide + publish-requested 载荷）+ 独立页接线 + 集群 Tab 经 `useClusterPluginEntity`（publishGuide CONFIG + editingCurrentVersion）（e338da9d）
- [x] 2. 批 2 全局规则：`useClusterGlobalRules` CONFIG + 独立页/集群 Tab 接线；modal 载荷补 currentVersion 对齐 RouteFormModal（890a0781）
- [x] 3. 批 3 插件元数据：卡片组件（添加+编辑）+ 独立页（添加+编辑）单通道化（06feb3e2）
- [x] 4. 批 4 4层代理/DNS：共享 `StreamProxyFormWizard` + 两页接线（54022c7b）
- [x] 5. 批 5 SSL：`SslFormDrawer` + 证书页接线（b44e2ab5）
- [x] 6. 收口：前端全量 2711/2711 绿（#58 协议：中途两轮漂移失败集隔离复跑全绿定性波动）；`npx vue-tsc -b` 通过；每批独立 commit 独立可回滚
