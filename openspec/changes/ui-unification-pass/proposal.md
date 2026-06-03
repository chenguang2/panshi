## Why

前一轮 UI 改造（redesign-frontend-ui）完成了核心视觉体系重建（组件库、侧边栏、Layout、登录页、Dashboard），但仍有部分页面和组件的大文件尚未完成样式统一，包括 EdgeClient、ClusterList 卡片网格、ConfigDiff、Tools 以及全局 style.css 的清理。本次 UI Unification Pass 旨在补齐这些遗留工作，使全套页面的视觉风格完全一致。

## What Changes

- **EdgeClient.vue 皮肤升级**：节点选择器区域使用卡片容器样式，Tab 内表格应用 BadgeStatus/MethodTag/FilterChip，JSON 查看器深色背景 + 等宽字体，页面头部使用 PageHeader
- **ClusterList.vue 卡片网格**：集群卡片使用新配色/字体/圆角体系，保留分组/展开/最大化全部交互功能
- **cluster 子页面统一**：clusters/Routes.vue 表格方法列使用 MethodTag，所有子页面状态列使用 BadgeStatus；Toolbar 跟随全局 token 无需专项改动
- **ConfigDiff.vue 抽屉**：summary-bar 统计卡片使用新配色，diff 行使用设计稿的对比色，保留 drawer 结构
- **Tools.vue 工具页**：工具面板区应用新卡片样式（工具页为工作台模式，无需 PageHeader）
- **EdgeImport.vue 步骤条**：a-steps 样式覆盖为设计稿的 wizard 风格
- **style.css 废弃 class 清理**：移除两个已不再使用的 class（`.card-stat-compact` + `.card-table`），其余活跃覆盖保留不动
- **不涉及**：不改动业务逻辑、API 调用、路由配置、状态管理

## Capabilities

### New Capabilities
- `edge-client-ui-unify`: EdgeClient.vue 完整视觉统一（节点选择器、表格、JSON 查看器）
- `cluster-card-ui-unify`: ClusterList 卡片网格新配色/字体/圆角
- `cluster-tabs-ui-unify`: 6 个 cluster 子页面 Toolbar 和表格样式统一
- `config-diff-ui-unify`: ConfigDiff 抽屉内部统计卡片和 diff 视图样式
- `tools-page-ui-unify`: Tools 工具面板卡片样式统一（工作台模式，无需 PageHeader）
- `edge-import-wizard-ui-unify`: EdgeImport 步骤条样式升级
- `style-css-cleanup`: style.css 废弃 class（`.card-stat-compact` + `.card-table`）清理

### Modified Capabilities
（无 spec 级别的行为变更，均为纯视觉实现层面的改进）

## Impact

- **前端文件**：`frontend/src/views/EdgeClient.vue`、`ClusterList.vue`、`ConfigDiff.vue`、`Tools.vue`、`clusters/*.vue`（6 个）、`EdgeImport.vue`
- **样式文件**：`frontend/src/style.css`（全局清理）
- **不涉及**：后端、API、路由、Store、Composable、测试用例
