## Why

当前 `response_rewrite` 插件的 schema 定义与 Edge 网关官方文档存在多处不一致（字段名、结构、缺失字段），导致生成的表单与网关实际能力不匹配。同时 `traffic_split` 插件的 `upstream_id` 使用纯文本输入，用户体验差且容易填错。

## What Changes

- 修正 `response_rewrite` 插件的 schema：字段名 `status_code` → `status`，`headers` 改为简单 Object，`add_headers` 提升为顶层字段，`regex_body` 支持 count 参数，新增条件表达式字段和 HTTP 方法重写
- 重构 `traffic_split` 插件的 UI：`upstream_id` 改为下拉选择框，选项来自系统上游列表

## Capabilities

### New Capabilities
- `response-rewrite`: 修正后的 response_rewrite 插件 schema 定义
- `traffic-split-ui`: traffic_split 插件上游选择器 UI

### Modified Capabilities
（无 — 这两个都是新规格）

## Impact

- **后端**：`backend/app/api/v1/plugins.py` — 修改 `response_rewrite` 的 schema 定义
- **前端**：
  - `frontend/src/components/PluginEditorDrawer.vue` — 支持 `upstream_id` 下拉选择
  - `frontend/src/views/ClusterList.vue` 或相关 composable — 传递上游列表到插件编辑器
