## Context

当前前端基于 Vue 3 + Ant Design Vue 构建，使用 Ant Design 默认内置组件（a-layout-sider、a-menu、a-table 等）。尽管已有 tokens.css 驱动的主题系统和 glass/mordern 风格，但整体 UI 仍呈现通用的 Ant Design 外观。

设计样稿（Live-Artifact-3）提供了一套完整的视觉语言：
- 暗色侧边栏，分 section 显示导航项，底部有用户信息区域
- 卡片式的内容区域，带顶部色条的统计卡片
- 表格包装在带 header/footer 的卡片容器中
- 统一的页面头部（标题+描述+操作区）
- 自定义 HTTP 方法标签、状态徽章、筛选芯片
- 整体使用 oklch 色彩体系和 monospace 字体

## Goals / Non-Goals

**Goals:**
- 按照设计样稿重建前端视觉风格，提升专业度和品牌一致性
- 新增一组可复用通用组件（PageHeader、StatCard、TableCard、BadgeStatus、MethodTag、FilterChip）
- 创建 `AppSidebar.vue` + wrapper composable 替代 Ant Design a-layout-sider
- 移除废弃的 topnav / fullwidth 布局模式，只保留 sidebar
- 按设计稿重写 Login.vue（移除 LiquidGlass 依赖）
- 保持所有业务逻辑、路由、状态管理、API 调用不变
- 保持现有主题色切换和暗色模式兼容

**Non-Goals:**
- 不改动后端代码和 API
- 不改动路由配置
- 不改动权限和认证逻辑
- 不改动测试用例（视觉变化不影响行为逻辑测试）
- 不添加新的业务功能

## Decisions

### Decision 1：自定义 Sidebar 架构（选项 C）

**选择**：创建独立的 `AppSidebar.vue` 组件（纯 UI，props 驱动）+ layout wrapper composable 处理 content offset 和响应式断点，替代 Ant Design `a-layout-sider` + `a-menu`。

**结构**：
- `AppSidebar.vue`：只负责侧边栏 UI——品牌 Logo、section 分组导航、底部用户信息、折叠/展开状态
- layout wrapper composable（内联在 DefaultLayout.vue 中）：管理 content 区域 `margin-left`、监听响应式断点自动折叠、将 collapsed 状态同步到 localStorage
- `DefaultLayout.vue`：使用以上两者，不再使用 `a-layout-sider` / `a-menu`

**理由**：
- 职责清晰，AppSidebar 只关心"侧边栏长什么样"，layout 管理交给 wrapper
- DOM 完全可控，section 分组、底部用户区域、自定义图标自由实现
- 不需要 `!important` 覆盖 Ant Design 组件样式
- 折叠动画、响应式行为由 wrapper composable 统一管理，与 UI 解耦

**替代方案 A**：保留 `a-layout-sider` 外壳，仅替换内部 `a-menu`。缺点：Ant Design 的 DOM 结构限制多，底部用户区难以自然放置，需要大量 `!important`。

**替代方案 B**：完全自定义，不用任何 wrapper。缺点：content margin 管理和响应式逻辑混在 UI 组件中，职责不清晰。

### Decision 2：通用组件提取

**选择**：将页面头部、统计卡片、表格卡片、状态徽章提取为 `frontend/src/components/` 下的独立组件。

**理由**：
- Dashboard、集群概览、路由管理等 10+ 个页面均使用这些模式
- 统一组件确保视觉一致性，修改一处即可全局生效
- 组件内封装完整的样式和逻辑，避免重复

### Decision 3：TableCard 使用 v-bind="$attrs" 透传

**选择**：`TableCard.vue` 使用 `v-bind="$attrs"` + slot 透传模式，将所有 props 和 slots 传递给内部 `<a-table>`。

**理由**：
- `<a-table>` 有 40+ props（columns、dataSource、loading、pagination、rowKey、scroll 等），逐一显式声明不现实
- TableCard 是纯展示层 wrapper，职责是"给表格加卡片壳子"，不关心表格内容
- `v-bind="$attrs"` 让 TableCard 适用于所有使用 a-table 的场景，开发者无需判断"这个页面能不能用 TableCard"
- 配合 `inheritAttrs: false` + slot 透传，class/style 无冲突
- 这与项目中现有业务组件（PublishConfirmModal 等）显式声明 props 的模式不同，但 TableCard 的性质是纯展示包装，抽象层次不同

### Decision 4：不修改 Ant Design 全局样式（保留现有覆盖）

**选择**：新增组件使用自定义 CSS，不对 Ant Design 全局样式进行大范围覆盖；`frontend/src/style.css` 中现有 `!important` 覆盖保持不动，在所有页面改造完成后统一清理。

**理由**：
- 现有 Ant Design 表单/表格/弹窗等功能性组件在改造过程中仍然使用这些覆盖
- 改造完成后再系统清理，避免中途出现视觉不一致
- 仅在显式使用新组件的地方应用新风格，降低回归风险

### Decision 5：扩展 tokens 而非替换

**选择**：在现有 tokens.css 基础上添加新变量，不删除或重命名现有变量。

**理由**：
- 现有主题系统依赖现有 token 变量
- 兼容 design-default/modern 的切换
- 新增变量：font-display（展示字体）、font-mono（等宽字体增强）、新的阴影层级等

### Decision 6：移除废弃布局模式

**选择**：去掉 topnav 和 fullwidth 布局模式，只保留 sidebar。

**理由**：
- 设计样稿只设计了一套布局（sidebar），保持另外两套意味着风格割裂或三倍设计稿
- 切换入口深埋 3 层菜单，普通用户几乎无法发现
- 无任何 E2E 测试覆盖这两个模式
- 移除后 DefaultLayout.vue 中大量条件分支可以删除，代码量不增反减

### Decision 7：Login 页面完全按设计稿重写

**选择**：完全按设计样稿 `login.html` 重写 Login.vue，移除 `@wxperia/liquid-glass-vue` 依赖。

**改动**：
- 暗色背景（`var(--sidebar-bg)`）+ 径向辉光效果
- 品牌 Logo 卡片："磐"字图标 + "磐石 Gateway" + 分隔线 + 版本号
- 输入框带前缀图标 + 错误提示框 + 记住我复选框 + 忘记密码链接
- 登录按钮 spinner loading + Token 认证提示 + 页脚版权信息

### Decision 8：大文件分层改造

**选择**：对 EdgeClient.vue（1621 行）和 ClusterList.vue（1557 行）等大文件采用分层改造策略。

**层次**：
1. 先替换 page-header 和小组件（BadgeStatus、MethodTag、FilterChip）——低风险
2. 再改造卡片容器、节点选择器样式等——中风险
3. 最后处理细节样式调优——低风险

**理由**：分层改造允许每一步独立验证，避免大型重构引入的回归难以定位。

### Decision 9：侧边栏折叠状态行为（行业惯例）

**选择**：侧边栏折叠后按行业常见做法处理。

**行为**：
- 分组标题 → 折叠后变为 1px 分隔线
- 底部用户 → 只显示头像，hover 弹出 tooltip 显示用户名和退出
- 导航项 → hover 弹出 tooltip 显示文字标签

### Decision 10：ConfigDiff 保持 Drawer 结构

**选择**：ConfigDiff.vue 保持 `<a-drawer>` 结构，不改为独立页面，不使用 PageHeader 组件。

**理由**：Drawer 已有自带的 title + extra 区域，叠加 PageHeader 会造成 UI 冗余。仅升级内部统计卡片和 diff 视图的配色/字体即可。

## Risks / Trade-offs

- **[风格兼容]** 新组件在暗色模式和不同主题色下需要逐一验证 → 使用 CSS 变量联动，组件只引用 token 变量而非硬编码色值
- **[维护成本]** 新增 6 个组件增加了代码体积 → 组件职责单一，可复用性高，整体代码量可能减少（消除重复的 page-header 和 stat-card 内联样式）
- **[过渡动画]** 设计稿使用了较多动画效果（卡片 fadeIn、悬浮上移）→ 通过 CSS transition 实现，不影响功能
- **[响应式]** 自定义侧边栏在不同屏幕宽度下的行为需要处理 → wrapper composable 统一管理断点
- **[大文件风险]** EdgeClient（1621 行）和 ClusterList（1557 行）改造中可能引入回归 → 分层改造 + 每层独立验证
