## Context

前端当前使用三套主题（light/dark/default），色值为 RGBA。设计稿使用 OKLCH 色域的单套设计系统，颜色更现代、层次更分明。

设计稿来源：`docs/ui/Live-Artifact-3/styles/theme.css`

## CSS Variable Mapping

设计系统 token ↔ 旧 `--p-*` 映射关系（组件替换依据）：

| 设计 token | 旧变量 | OKLCH 值 | 用途 |
|---|---|---|---|
| `--bg` | `--p-bg-page` | `oklch(97% 0.005 250)` | 页面背景 |
| `--surface` | `--p-bg-elevated` | `oklch(100% 0 0)` | 卡片/表面背景 |
| `--fg` | `--p-text-primary` | `oklch(20% 0.02 240)` | 主要文字 |
| `--muted` | `--p-text-secondary` | `oklch(50% 0.018 240)` | 次要文字/边框 |
| `--border` | `--p-border-default` | `oklch(88% 0.008 240)` | 边框 |
| `--accent` | `--p-color-primary` | `oklch(56% 0.16 210)` | 强调色（蓝色） |
| `--success` | `--p-color-success` | `oklch(55% 0.15 145)` | 成功 |
| `--warning` | `--p-color-warning` | `oklch(65% 0.15 85)` | 警告 |
| `--danger` | `--p-color-danger` | `oklch(55% 0.18 28)` | 危险 |
| `--info` | `--p-color-info` | `oklch(55% 0.12 240)` | 信息 |
| `--sidebar-bg` | `--p-sidebar-bg` | `oklch(18% 0.015 250)` | 侧边栏背景 |
| `--sidebar-fg` | `--p-sidebar-text` | `oklch(80% 0.01 250)` | 侧边栏文字 |
| `--sidebar-active` | `--p-sidebar-active` | `oklch(56% 0.16 210)` | 侧边栏激活态 |
| `--font-body` | `--p-sans` | `-apple-system, ...` | 正文字体 |
| `--font-mono` | `--p-mono` | `'JetBrains Mono', ...` | 等宽字体 |
| `--radius-sm` | `--p-radius-sm` | `4px` | 小圆角 |
| `--radius-md` | `--p-radius-md` | `6px` | 中圆角 |
| `--radius-lg` | `--p-radius-lg` | `8px` | 大圆角 |
| `--shadow-sm` | `--p-shadow-sm` | `0 1px 2px oklch(0% 0 0 / 6%)` | 小阴影 |
| `--shadow-md` | `--p-shadow-md` | `0 4px 12px oklch(0% 0 0 / 8%)` | 中阴影 |
| `--shadow-lg` | `--p-shadow-lg` | `0 8px 24px oklch(0% 0 0 / 10%)` | 大阴影 |

## Global Utility Classes

来自 `theme.css` 的全局类将加入 `style.css`：

- `.btn` / `.btn-primary` / `.btn-secondary` / `.btn-ghost` / `.btn-danger` / `.btn-sm`
- `.toggle` / `.toggle-slider`（自定义开关，替换 Ant Design Switch）
- `.card` / `.card-header` / `.card-body`
- `.form-input` / `.form-group` / `.form-label`
- `.search-input-wrap`
- `.tag` / `.badge`
- `.empty-state`
- `.loading-spinner`

## Scope

**27 个 Vue 文件**涉及 `var(--p-*)` 替换，按影响大小排列：

1. `ClusterList.vue` (183处)
2. `PluginSelector.vue` (82处)
3. `UserList.vue` (106处)
4. `PluginMetadata.vue` (49处)
5. 其他 23 个文件 (总计 ~430处)

**5 个文件**涉及 `<a-switch>` 替换：
- `PluginSwitches.vue`
- `PluginEditorDrawer.vue`
- `ClusterUpstreams.vue`
- `ClusterRoutes.vue`
- `EdgeClient.vue`

## Removals

- `frontend/src/stores/theme.ts` — 主题切换 store 需要简化或移除
- `frontend/src/stores/theme.test.ts` — 相关测试
- `frontend/src/composables/useAntdThemeSync.ts` — Ant Design 主题同步
