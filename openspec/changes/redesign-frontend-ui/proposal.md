## Why

当前前端页面视觉效果不够专业，使用 Ant Design 默认风格组件，缺乏品牌辨识度和统一设计语言。参照设计样稿（Live-Artifact-3）给出的视觉风格，需要一次全面的 UI 改造，使其更具现代感、专业度和品牌一致性。

## What Changes

- **全新侧边栏导航**：从 Ant Design `a-menu` 改为自定义 `AppSidebar` 组件 + wrapper composable，支持 section 分组标题（核心功能/系统管理/Edge功能）、自定义图标、底部用户信息区域（含头像/用户名/角色/退出）
- **移除废弃布局模式**：去掉 topnav 和 fullwidth 布局模式，只保留 sidebar；header 用户菜单移除，退出入口统一放侧边栏底部
- **统一页面头部**：每个页面使用一致的 `PageHeader` 组件（标题 + 描述 + 操作按钮插槽）
- **统计卡片升级**：使用 `StatCard` 通用组件（图标行、指示色条、副标题、hover 动效）
- **表格卡片容器**：使用 `TableCard` 组件包裹 a-table，通过 `v-bind="$attrs"` 透传所有 table props 和 slots
- **HTTP 方法标签**：`MethodTag` 组件，GET/POST/PUT/DELETE/PATCH 各带独立颜色
- **筛选标签芯片**：`FilterChip` 组件，pill 形状 + 激活态切换
- **状态指示器**：`BadgeStatus` 组件，圆点 + 文字 + 颜色映射（在线/离线/维护中/禁用）
- **登录页改造**：按设计稿完全重写 Login.vue（暗色背景 + 品牌 Logo 卡片 + 输入框前缀图标 + 错误提示框 + 记住我 + Token 认证提示 + 页脚版本号）
- **设计 tokens 升级**：扩展 tokens.css，新增 --font-display / --font-mono 等变量
- **保留所有业务逻辑**：不改动路由、组合式函数、API 调用、CRUD、权限控制
- **主题系统兼容**：新增 token 与现有 theme-system（主题色切换、暗色模式）保持兼容

## Capabilities

### New Capabilities
- `redesigned-sidebar`: 自定义 section 分组式侧边栏，含 logo、分组导航、底部用户信息
- `redesigned-page-header`: 统一页面头部组件（标题 + 描述 + 操作按钮区域）
- `redesigned-stat-card`: 升级版统计卡片（图标、数值、标签、指示色条、hover 动效）
- `redesigned-table-card`: 表格卡片容器（header + table + footer）
- `redesigned-badges`: 统一状态徽章（圆点 + 文字 + 颜色）、HTTP 方法标签、筛选芯片
- `redesigned-tokens`: 扩展设计 tokens 体系，补充设计稿中的字体/阴影/圆角变量

### Modified Capabilities
- `theme-system`: 扩展 tokens.css，添加新设计变量；保持与现有主题色/暗色模式兼容
- `sidebar-layout`: 从 Ant Design `a-menu` 实现改为自定义 section 分组式侧边栏；增加底部用户信息区域；导航项按 section 分组显示

## Impact

- **前端文件**：`frontend/src/views/DefaultLayout.vue`（侧边栏重构 + 移除 topnav/fullwidth）、`frontend/src/views/Login.vue`（完全重写）、`frontend/src/views/Dashboard.vue`（统计卡片升级）、所有 views 页面改造（页面头部、表格卡片、状态徽章等）
- **样式文件**：`frontend/src/styles/tokens.css`（扩展 tokens）、`frontend/src/style.css`（全局样式调整，改造完成后清理）
- **组件库**：新增 `frontend/src/components/` 下 6 个通用组件（PageHeader、StatCard、TableCard、BadgeStatus、MethodTag、FilterChip）
- **新文件**：`frontend/src/components/AppSidebar.vue`（自定义侧边栏组件）
- **删除文件**：从 `frontend/src/views/DefaultLayout.vue` 移除 topnav/fullwidth 分支；从 `frontend/src/stores/theme.ts` 移除 layoutMode 相关逻辑；从 `package.json` 移除 `@wxperia/liquid-glass-vue`
- **不涉及**：后端、API、路由配置、Composable、Store（theme 小幅清理除外）、权限逻辑、测试用例
