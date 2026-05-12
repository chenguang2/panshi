## Context

路由插件配置存储在 `backend/app/api/v1/plugins.py` 的 `BUILTIN_PLUGINS` 中，前端通过 `/api/v1/plugins/builtin` 获取。插件编辑器 `PluginEditorDrawer.vue` 根据 schema 动态渲染表单字段。

## Goals / Non-Goals

**Goals:**
- 精简插件列表到 7 个常用插件
- 以文档为准调整 schema 字段和默认值
- 示例展示支持可折叠 JSON 树视图

**Non-Goals:**
- 不修改后端 API 路由结构

## Decisions

| 决策 | 选择 | 理由 |
|---|---|---|
| 示例展示 | `JsonEditorVue` 只读模式 | 支持 Text/Tree/Table 切换 |
| 默认值 | schema + `buildConfigFromForm` 判等跳过 | 减少冗余配置 |
| 条件字段 | `visibleSchemaFields` computed | `redis_conf` 仅在 policy=redis 时显示 |
| array 序列化 | 简单 items → 逗号拼接，复杂 items → JSON | 兼容 regex_uri 和 splits 两种场景 |
