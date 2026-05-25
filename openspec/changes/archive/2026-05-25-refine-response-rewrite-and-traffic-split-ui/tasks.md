## 1. Backend — 修正 response_rewrite 插件 schema

- [ ] 1.1 将 `status_code` 字段重命名为 `status`，类型 `integer`，描述提及 200-599
- [ ] 1.2 将 `headers` 改为简单 Object 类型（移除 set/add/remove 嵌套）
- [ ] 1.3 将 `add_headers` 提升为顶层 Object 字段
- [ ] 1.4 修正 `regex_body` 格式说明，支持 `[regex, replacement, count]`
- [ ] 1.5 新增 `include_add_headers_expr`、`include_headers_expr`、`include_body_expr` 条件表达式字段
- [ ] 1.6 新增 HTTP 方法重写字段说明

## 2. 前端 — traffic_split upstream 下拉选择

- [ ] 2.1 PluginEditorDrawer 新增 `upstreams` prop
- [ ] 2.2 PluginEditorDrawer 新增 `select` 类型渲染分支（识别 schema 中的 select 标记）
- [ ] 2.3 在 traffic_split 的 `upstream_id` schema 中加入 select 标记
- [ ] 2.4 ClusterList.vue 中传递上游列表到 PluginEditorDrawer
