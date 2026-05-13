## Context

Edge API 已有 `/edge/admin/plugin_configs` 端点，EdgeClient 已有 `list/create/update/delete_plugin_config` 方法。本地 DB 没有 PluginConfig 模型（之前仅通过 EdgeClient 直接操作边缘节点），需要新增。

## Goals / Non-Goals

**Goals:**
- 本地 DB 存储插件组（CRUD），发布时同步到 Edge 节点
- 卡片式 UI，每个卡片内展示插件名标签
- 复用已有 PluginSelector/PluginEditorDrawer 编辑插件配置
- 版本管理复用已有 ConfigVersion 机制

**Non-Goals:**
- 不改造现有路由/上游发布流程

## Decisions

| 决策 | 选择 | 理由 |
|---|---|---|
| UI 模式 | 卡片仪表盘（方案 B） | 插件组数量少，卡片直观展示每个插件 |
| 数据存储 | 本地 DB + 发布同步 | 与上游/路由一致，支持版本管理 |
| 插件配置编辑 | 复用 PluginSelector | 代码复用，用户体验统一 |
| 发布 API | 同上游 publish 模式 | 统一模式 |
