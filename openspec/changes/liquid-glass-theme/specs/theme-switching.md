# Theme Switching

## Overview

支持亮色/暗色双主题 + 5 种主题色切换。通过切换 `<html>` 的 class 实现，零 JS 运行时开销。

## Theme Mode

| 模式 | html class | 变量来源 |
|------|-----------|---------|
| 亮色 | `theme-light` | `theme-light.css` |
| 暗色 | `theme-dark` | `theme-dark.css` |

## Theme Colors

| 名称 | 色值 | 变量 |
|------|------|------|
| 极光蓝 | `#1890ff` | `--p-color-primary` |
| 翡翠绿 | `#52c41a` | `--p-color-primary` |
| 优雅紫 | `#7c3aed` | `--p-color-primary` |
| 暖阳橙 | `#fa8c16` | `--p-color-primary` |
| 中国红 | `#f5222d` | `--p-color-primary` |

## Dynamic Updates

主题色切换时，App.vue 通过 JS `setProperty` 动态设置以下变量：
- `--p-color-primary`, `--p-color-primary-hover/active/bg`
- `--p-bg-page`, `--p-bg-glass`, `--p-bg-glass-table`
- `--p-glass-border`, `--p-bg-hover`, `--p-border-hover/active`
