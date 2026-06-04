## Why

当前前端使用自有的 `--p-*` CSS 变量体系和三套主题（light/dark/default），基于 RGBA 色值。设计稿 `docs/ui/Live-Artifact-3/` 使用 OKLCH 色域的设计系统（`theme.css`），视觉上更现代、柔和且有层次感。

需全局替换为主题.css 的设计系统，统一为一种风格，丢弃旧的多主题体系。

## What Changes

- **CSS 变量体系**：以 `theme.css` 的 OKLCH token（`--bg`、`--surface`、`--fg`、`--muted`、`--border`、`--accent` 等）替代 `--p-*` 体系
- **主题文件**：合并 `tokens.css` + `theme-light.css` + `theme-dark.css` + `theme-default.css` 为单个 `theme.css`
- **全局样式**：重写 `style.css`，加入设计系统的全局工具类（`.btn`、`.toggle`、`.card`、`.form-input` 等）
- **27 个 Vue 组件**：`var(--p-*)` 统一替换为设计 token 名
- **Toggle 开关**：`<a-switch>` 替换为设计稿的自定义 `.toggle` 组件
- **主题切换逻辑**：移除多主题切换（theme store），只保留一套风格

## Capabilities

### New

- `design-system`: 全局设计系统统一

### Removed

- `theme-switching`: 移除多主题切换功能（不再需要 theme store / themeClass）

## Impact

- `frontend/src/styles/tokens.css` — 删除
- `frontend/src/styles/theme-light.css` — 删除
- `frontend/src/styles/theme-dark.css` — 删除
- `frontend/src/styles/theme-default.css` — 删除
- `frontend/src/styles/theme.css` — 新增（设计系统 OKLCH token）
- `frontend/src/style.css` — 重写（加入设计系统全局样式）
- `frontend/src/main.ts` — 修改 import
- `frontend/src/stores/theme.ts` — 修改/简化
- `frontend/src/App.vue` — 调整
- 27 个 Vue 文件 — `var(--p-*)` 替换
- 5 个文件 — `<a-switch>` → `.toggle`
