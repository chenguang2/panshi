## Why

磐石 Admin 目前界面风格为传统的 Ant Design 浅色后台风格，缺乏现代感和品牌辨识度。需要引入液态玻璃（Liquid Glass / Glassmorphism）设计语言，建立统一的 Design Token 变量体系，实现亮色/暗色主题切换和多种主题色切换，提升产品的视觉质感和用户体验。

## What Changes

- 建立完整的 CSS Design Token 变量体系（约 40 个语义化变量）
- 引入液态玻璃（Glassmorphism）设计语言：半透明背景、模糊效果、光感边框
- 实现亮色/暗色双主题切换，跟随系统偏好或手动切换
- 实现 5 种主题色切换（极光蓝、翡翠绿、优雅紫、暖阳橙、中国红）
- 所有前端页面统一使用 Design Token，消除硬编码颜色值
- 登录页使用 LiquidGlass WebGL 组件实现动态玻璃效果
- 仪表盘、集群管理、边缘节点等所有页面适配新主题体系
- Ant Design 组件通过 ConfigProvider 桥接实现主题同步

## Capabilities

### New Capabilities

- `design-token-system`: 完整的 CSS 变量体系，包括背景色、文字色、边框色、品牌色、阴影等约 40 个语义化变量
- `theme-switching`: 亮色/暗色主题切换 + 5 种主题色切换，通过切换 html class 实现，零 JS 运行时开销
- `glassmorphism-ui`: 液态玻璃 UI 组件风格，backdrop-filter 毛玻璃效果、光感边框、悬浮动效
- `antd-theme-bridge`: Ant Design Vue ConfigProvider 桥接层，从 CSS 变量读取主题值同步给 Ant Design 组件
- `page-theming`: 所有功能页面的主题适配（登录、仪表盘、集群管理、边缘节点、工具箱、用户管理等）

### Modified Capabilities

- （无，本分支为全新主题系统，未修改已有功能规格）

## Impact

- 前端依赖新增：`@wxperia/liquid-glass-vue`（登录页液态玻璃效果）
- 新增 5 个文件：`tokens.css`、`theme-light.css`、`theme-dark.css`、`useAntdThemeSync.ts`、`theme-color-maps`
- 修改约 20 个 Vue 组件文件，替换硬编码颜色为 CSS 变量
- 后端新增 3 个集群统计字段（无需前端改造）
- 所有 Ant Design 组件通过 ConfigProvider 自动适配主题
