## Context

全局规则、插件组、静态资源、插件元数据四个列表页使用卡片网格展示数据，并支持集群筛选。但当用户选择"全部集群"时，卡片上看不到集群归属，无法区分来源。

已有实现：后端 API 已返回 `cluster_name` 字段，前端未展示。

## Goals / Non-Goals

**Goals:**
- 四个页面每张卡片顶部添加浅蓝色顶栏，显示 `cluster_name`
- 后端 `cluster_name` 在 `display_name` 为 NULL 时回退到 `name`

**Non-Goals:**
- 不修改卡片内容布局
- 不修改其他页面

## Decisions

### 1. 顶栏样式统一
- **方案**: 所有页面使用一致的 CSS：`background: oklch(56% 0.16 210 / 8%)` + `color: var(--accent)` + `border-bottom: 1px solid oklch(56% 0.16 210 / 12%)`
- **理由**: 保持设计系统一致性

### 2. 后端回退逻辑
- **方案**: `cluster_map = {row[0]: row[1] or row[2] for row in c_result.all()}`，`display_name` 为空时用 `name`
- **理由**: Cluster 模型有 `display_name` 和 `name` 两个字段，`display_name` 可能为 NULL

## Risks / Trade-offs

- 无显著风险
