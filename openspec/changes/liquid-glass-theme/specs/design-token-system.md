# Design Token System

## Overview

建立约 40 个 CSS 自定义属性（Design Token），涵盖背景、文字、边框、品牌色、阴影、圆角、间距等所有视觉维度。

## Variables

| 分类 | 变量前缀 | 数量 | 示例 |
|------|---------|------|------|
| 背景 | `--p-bg-*` | 8 | `--p-bg-page`, `--p-bg-glass` |
| 文字 | `--p-text-*` | 5 | `--p-text-primary`, `--p-text-secondary` |
| 边框 | `--p-border-*` | 4 | `--p-border-default`, `--p-border-hover` |
| 品牌色 | `--p-color-*` | 8 | `--p-color-primary`, `--p-color-danger` |
| 阴影 | `--p-shadow-*` | 4 | `--p-shadow-sm`, `--p-shadow-glass` |
| 圆角 | `--p-radius-*` | 4 | `--p-radius-lg`, `--p-radius-sm` |
| 字体 | `--p-sans`, `--p-mono` | 2 | `--p-sans` |

## Files

- `frontend/src/styles/tokens.css` — 变量声明（不赋值）
- `frontend/src/styles/theme-light.css` — 亮色主题值
- `frontend/src/styles/theme-dark.css` — 暗色主题值
