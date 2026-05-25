## Why

PluginSelector 的左右两栏交互体验需要优化：右侧操作按钮无提示、左侧分类/插件关系不清晰、选中态视觉反馈不足、主题色未统一。

## What Changes

- 右侧编辑/删除按钮加 tooltip + 间距加大
- 左侧改为树形结构（缩进 + 树线连接），分类标题加色条
- 选中卡片右上角 "已选 ✓" 角标，右下角 "× 移除"
- 主题色全面统一（所有硬编码颜色改为 --p-color-* 变量）
- 页面背景强制使用经典灰 #f0f2f5，移除现代模式染色
- 右侧列表加分类色条、hover 高亮、配置状态标签

## Capabilities

### New Capabilities
- `plugin-selector-ux`: PluginSelector 交互与视觉优化

### Modified Capabilities
（无）

## Impact

- `frontend/src/components/PluginSelector.vue` — 树形结构、tooltip、角标、色条
- `frontend/src/App.vue` — 移除 syncModernBg 中 --p-bg-page 设置
- `frontend/src/stores/theme.ts` — 默认 style 改为 default
- `frontend/src/styles/*.css` — 移除 theme-light/dark 中的 --p-bg-page
- `frontend/src/views/DefaultLayout.vue` — hover 高亮
