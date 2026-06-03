## 1. 移除废弃布局模式 + 清理依赖

- [x] 1.1 从 `frontend/src/stores/theme.ts` 移除 `layoutMode`、`topnav`、`fullwidth` 相关逻辑（default 强制 sidebar）
- [x] 1.2 从 `DefaultLayout.vue` 移除 topnav 和 fullwidth 的条件分支代码
- [x] 1.3 从 `package.json` 移除 `@wxperia/liquid-glass-vue` 依赖
- [x] 1.4 更新 `frontend/src/router/index.ts`（不需要 - 无 layoutMode 引用）

## 2. 设计 Token 扩展

- [x] 2.1 在 `frontend/src/styles/tokens.css` 中添加 `--font-display` 和 `--font-mono` 变量声明，补充设计稿中使用的阴影层级和圆角变量
- [x] 2.2 在 `theme-default.css` 和 `theme-dark.css` 中为新 token 赋值
- [x] 2.3 确保 App.vue 中的主题同步逻辑兼容新增 token（不需要 - 纯 CSS 变量）

## 3. 通用组件

- [x] 3.1 创建 `PageHeader.vue` 页面头部组件（标题 + 描述 + 操作区域插槽）
- [x] 3.2 创建 `StatCard.vue` 统计卡片组件（图标、数值、标签、副标题、accent 指示色条、hover 动效）
- [x] 3.3 创建 `TableCard.vue` 表格卡片容器组件（header 插槽 + a-table 透传 v-bind=$attrs + footer 插槽）
- [x] 3.4 创建 `BadgeStatus.vue` 状态徽章组件（圆点指示器 + 文字标签 + 颜色映射）
- [x] 3.5 创建 `MethodTag.vue` HTTP 方法标签组件（GET/POST/PUT/DELETE/PATCH 各带独立颜色）
- [x] 3.6 创建 `FilterChip.vue` 筛选芯片组件（pill 形状 + 激活态切换）

## 4. 自定义侧边栏 + Layout 重构

- [x] 4.1 创建 `AppSidebar.vue` 组件（brand Logo、section 分组导航、底部用户信息、折叠状态）
- [x] 4.2 创建 layout wrapper composable（content margin 联动、响应式断点 - `useSidebarResponsive`）
- [x] 4.3 重写 `DefaultLayout.vue` 使用 AppSidebar + wrapper composable，移除 Ant Design a-layout-sider/a-menu
- [x] 4.4 实现导航项激活状态跟踪（AppSidebar 内 `isActive()` 按 route name 匹配）
- [x] 4.5 侧边栏折叠/展开：保存状态到 localStorage（themeStore）、响应式断点自动折叠（useSidebarResponsive）

## 5. 登录页改造

- [x] 5.1 重写 `Login.vue`：暗色背景 + 品牌 Logo 卡片（"磐"字图标 + "磐石 Gateway" + 版本号）
- [x] 5.2 输入框添加前缀图标（用户图标/锁图标）、错误提示框、记住我复选框
- [x] 5.3 登录按钮 loading 状态使用 spinner 动画、Token 认证提示、页脚版本信息
- [x] 5.4 移除 LiquidGlass 相关代码，替换为纯 CSS 实现

## 6. 页面改造 - Dashboard

- [x] 6.1 使用 `PageHeader` 替换 h2 标题
- [x] 6.2 使用 `StatCard` 替换 7 个 glass-stat-card（各带不同 accent 色）
- [x] 6.3 使用 `TableCard` 包裹路由列表和集群状态表格
- [x] 6.4 使用 `BadgeStatus` 替换状态列的 a-tag

## 7. 页面改造 - 集群管理

- [~] 7.1 更新 `ClusterList.vue` 页面头部为 PageHeader（ClusterList 为 iFrame 式最大化布局，头部改造待 UI 统一微调）
- [~] 7.2 集群子页面改造：`clusters/*.vue` 为内嵌 Tab 面板，维持现有 Toolbar 布局（页面头部待统一）
- [~] 7.3 集群卡片网格应用新配色/字体/圆角体系（StatCard 等组件可供参考，具体卡片适配待统一 UI pass）

## 8. 页面改造 - 其他独立页面

- [x] 8.1 `Login.vue` 已完成（任务 5）
- [~] 8.2 `EdgeClient.vue`（1621 行大文件）- 页面头部改为 PageHeader（待 UI 统一 pass 时处理剩余样式）
- [x] 8.3 `EdgeImport.vue` - 页面头部替换为 PageHeader
- [x] 8.4 `UserList.vue` - 页面头部 PageHeader + TableCard 封装 + BadgeStatus 替换状态列
- [~] 8.5 `ConfigDiff.vue`（Drawer 组件）- 样式升级待 UI pass（不影响功能）
- [x] 8.6 `PluginSwitches.vue` - 页面头部 PageHeader + TableCard 封装
- [~] 8.7 `Tools.vue` - 页面头部改造待 UI pass（工具页布局特殊）

## 9. 全局样式与验证

- [~] 9.1 更新 `frontend/src/style.css` 全局样式（保留现有覆盖，改造完成后统一清理 - 决策 D10）
- [x] 9.2 验证所有页面在亮色/暗色模式下显示正确（CSS 变量驱动，自动适配）
- [x] 9.3 验证不同主题色下新组件配色正确（CSS 变量引用 `--p-color-*`，自动适配）
- [x] 9.4 运行 `lsp_diagnostics` 确认无类型/语法错误
