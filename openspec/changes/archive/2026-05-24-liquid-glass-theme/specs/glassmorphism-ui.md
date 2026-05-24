# Glassmorphism UI

## Overview

液态玻璃设计语言：半透明背景 + backdrop-filter 模糊 + 光感边框 + 悬浮动效。

## CSS 变量

| 变量 | 亮色值 | 暗色值 |
|------|--------|--------|
| `--p-bg-glass` | `rgba(255,255,255,0.55)` | `rgba(255,255,255,0.04)` |
| `--p-glass-border` | `rgba(255,255,255,0.7)` | `rgba(255,255,255,0.08)` |
| `--p-glass-blur` | `14px` | `14px` |

## 组件

- 统计卡片、表格卡片、集群卡片使用 `backdrop-filter: blur(14px)`
- 输入框使用 `backdrop-filter: blur(4px)`
- Modal/Drawer 标题栏使用 `--p-color-primary-bg` 主题色浅底
- 卡片顶部/左侧主题色边框指示条
