## 1. Design Token 变量体系

- [x] 1.1 创建 tokens.css（所有 --p-* 变量声明）
- [x] 1.2 创建 theme-light.css（亮色主题所有变量值）
- [x] 1.3 创建 theme-dark.css（暗色主题所有变量值）
- [x] 1.4 改造 theme.store.ts（html class 切换代替 JS 设变量）
- [x] 1.5 改造 main.ts 导入主题 CSS 文件
- [x] 1.6 清理 style.css 旧变量

## 2. Ant Design 桥接

- [x] 2.1 创建 useAntdThemeSync.ts composable（CSS 变量 → ConfigProvider token）
- [x] 2.2 改造 App.vue（使用新体系 + 动态变量同步）
- [x] 2.3 配置 5 种主题色的背景映射

## 3. 页面迁移

- [x] 3.1 迁移 Login.vue（液态玻璃卡片 + 透明输入框）
- [x] 3.2 迁移 Dashboard.vue（统计卡片、表格卡片、状态指示器）
- [x] 3.3 迁移 DefaultLayout.vue（侧边栏、头部、面包屑）
- [x] 3.4 迁移 ClusterList.vue + 全局 modal/drawer 样式
- [x] 3.5 迁移 6 个 tab 组件（ClusterNodes/Upstreams/Routes/PluginConfigs/GlobalRules/StaticResources）
- [x] 3.6 迁移 EdgeClient.vue、EdgeImport.vue、Tools.vue、UserList.vue

## 4. 共享组件迁移

- [x] 4.1 迁移 VersionManagementModal.vue（版本管理弹窗）
- [x] 4.2 迁移 ConfigDiff.vue（配置对比抽屉）
- [x] 4.3 迁移 PublishConfirmModal.vue（发布确认弹窗）
- [x] 4.4 迁移 PluginMetadata.vue、PluginSelector.vue、RouteAdvancedMatch.vue
- [x] 4.5 迁移 PluginEditorDrawer.vue

## 5. 后端增强

- [x] 5.1 ClusterResponse 新增 plugin_config_count / global_rule_count / static_resource_count
- [x] 5.2 list_clusters 接口查询并返回这 3 个计数

## 6. 细节优化

- [x] 6.1 添加主题色在 Header、面包屑、卡片边框的视觉标识
- [x] 6.2 添加 tab 统计数量显示
- [x] 6.3 修复 .plugin-config-card 内联样式覆盖 CSS 变量问题
- [x] 6.4 全局按钮样式统一（渐变 primary、玻璃 default、红色 danger）
- [x] 6.5 Modal/Drawer 使用主题色标题栏 + 纯色内容区
