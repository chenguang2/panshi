## 1. 创建设计系统 CSS

- [x] 1.1 创建 `src/styles/theme.css`（OKLCH 设计 token）
- [x] 1.2 删除旧主题文件（tokens.css, theme-light/dark/default.css）
- [x] 1.3 更新 `main.ts` 只 import 新的 theme.css
- [x] 1.4 重写 `style.css`：加入设计系统全局工具类（btn, toggle, card, form-input 等）

## 2. 简化主题切换

- [x] 2.1 简化/移除 theme store（不再需要多主题切换）
- [x] 2.2 移除 useAntdThemeSync.ts
- [x] 2.3 更新 App.vue / DefaultLayout.vue 移除主题 class 切换逻辑

## 3. 批量替换 CSS 变量

- [x] 3.1 批量替换 `var(--p-text-primary)` → `var(--fg)`（所有 27 个文件）
- [x] 3.2 批量替换 `var(--p-text-secondary)` → `var(--muted)`
- [x] 3.3 批量替换 `var(--p-text-tertiary)` → `var(--muted)`
- [x] 3.4 批量替换 `var(--p-bg-page)` → `var(--bg)`
- [x] 3.5 批量替换 `var(--p-bg-elevated)` → `var(--surface)`
- [x] 3.6 批量替换 `var(--p-border-default)` → `var(--border)`
- [x] 3.7 批量替换 `var(--p-color-primary)` → `var(--accent)`
- [x] 3.8 批量替换 `var(--p-color-primary-bg)` → `oklch(56% 0.16 210 / 10%)`
- [x] 3.9 批量替换 `var(--p-color-*)` → 对应语义 token
- [x] 3.10 批量替换 `var(--p-shadow-*)` → `var(--shadow-*)`
- [x] 3.11 批量替换 `var(--p-radius-*)` → `var(--radius-*)`
- [x] 3.12 批量替换 `var(--p-sidebar-*)` → `var(--sidebar-*)`
- [x] 3.13 批量替换其余 `var(--p-*)`（header, glass, space, sans, mono 等）

## 4. 替换 Toggle 开关

- [x] 4.1 在全局样式中加入 `.toggle` 自定义开关样式
- [x] 4.2 PluginSwitches.vue — `<a-switch>` → `.toggle`
- [x] 4.3 PluginEditorDrawer.vue — `<a-switch>` → `.toggle`
- [x] 4.4 ClusterUpstreams.vue — `<a-switch>` → `.toggle`
- [x] 4.5 ClusterRoutes.vue — `<a-switch>` → `.toggle`
- [x] 4.6 EdgeClient.vue — `<a-switch>` → `.toggle`

## 5. 验证

- [x] 5.1 前端构建通过（vite build 成功）
- [x] 5.2 前端测试全部通过（146 passed, 21 files）
- [ ] 5.3 手动验证全局视觉效果
