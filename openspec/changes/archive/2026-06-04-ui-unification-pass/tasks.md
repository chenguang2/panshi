## 1. EdgeClient 视觉统一

- [x] 1.1 添加 PageHeader 替换页面顶部标题区
- [x] 1.2 节点选择器区域卡片化（白色背景 + 圆角 + 边框 + 阴影）
- [ ] 1.3 Tab 内表格状态列使用 BadgeStatus，方法列使用 MethodTag
- [x] 1.4 JSON 查看器深色背景 + 等宽字体（无语法高亮）

## 2. ClusterList 卡片网格统一

- [ ] 2.1 集群卡片应用新背景/边框/圆角 token
- [ ] 2.2 状态圆点使用 BadgeStatus 样式（绿色/红色发光）
- [ ] 2.3 卡片内字体使用 `--font-mono` 等新 token

## 3. cluster 子页面表格内视觉统一

- [x] 3.1 Routes.vue — 状态列使用 BadgeStatus
- [x] 3.2 Upstreams.vue — 无状态列（使用 a-tag 版本标签），不需要改动
- [x] 3.3 Nodes.vue — 状态列使用 BadgeStatus
- [x] 3.4 PluginConfigs.vue — 无状态列（使用 a-tag 版本标签），不需要改动
- [x] 3.5 GlobalRules.vue — 无状态列（使用 a-tag 版本标签），不需要改动
- [x] 3.6 StaticResources.vue — 无状态列（使用 a-tag 版本标签），不需要改动

## 4. ConfigDiff 抽屉样式升级

- [x] 4.1 summary-bar 统计卡片使用新 token（玻璃效果背景 + 等宽字体数值）
- [x] 4.2 diff 行配色（一致=绿色，差异=红色，仅DB=橙色，仅Edge=蓝色）（已使用 CSS 变量，无需额外修改）

## 5. Tools 工具面板样式统一

- [x] 5.1 工具面板区应用新卡片样式（`--p-bg-glass-table` + `--p-radius-lg`）

## 6. EdgeImport 步骤条样式

- [x] 6.1 a-steps 覆盖为设计稿 wizard 卡片样式（激活色 + 完成色）

## 7. style.css 废弃 class 清理

- [x] 7.1 移除 `.card-stat-compact` 和 `.card-table` 样式（已不再使用）
- [x] 7.2 运行测试确认无回归（130 tests passed）
