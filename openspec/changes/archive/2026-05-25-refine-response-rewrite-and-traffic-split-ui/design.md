## Context

### response_rewrite 现状

当前 `backend/app/api/v1/plugins.py` 中 `response_rewrite` 的 schema 是早期版本，与 Edge 官方文档存在偏差：
- `status_code` 字段名应与文档一致改为 `status`
- `headers` 当前使用复杂的 set/add/remove 手风琴结构，但文档定义是简单 Object（覆盖已有标头）
- `add_headers` 嵌套在 headers 内，文档中是顶层独立字段
- 缺少条件表达式字段 `include_add_headers_expr`、`include_headers_expr`、`include_body_expr`
- 缺少 HTTP 方法级重写支持

### traffic_split 现状

`traffic_split` 的 `upstream_id` 是纯文本输入，用户需要手动记忆并输入上游 ID。系统已有完整的 upstream CRUD，前端可以用下拉框展示可选上游。

## Goals / Non-Goals

**Goals:**
- 使 `response_rewrite` 的 schema 与 Edge 文档完全一致
- `traffic_split` 的 `upstream_id` 改为从系统上游列表中选择

**Non-Goals:**
- 不修改 `response_rewrite` 前端表单渲染逻辑（现有 PluginEditorDrawer 已支持 Object、Array 等类型）
- 不修改后端 API 或数据模型
- 不为 `traffic_split` 添加全量图形化条件构造器（保持现有的表达式文本编辑方式）

## Decisions

- **`headers` 类型为简单 Object 而非嵌套结构**：文档将 `headers` 定义为 `{"Server": "Edge-Gateway"}` 形式的键值对，因此移除 set/add/remove 手风琴，使用现有的 Object 文本域渲染即可。
- **`add_headers` 提升为顶层字段**：与文档一致，独立于 `headers`，同样使用 Object 文本域。
- **`regex_body` 每项改为 3 元素数组**：`[regex, replacement, count]`，其中 count 为可选的替换次数。
- **`upstream_id` 下拉选择**：通过 props 向 PluginEditorDrawer 传入 `upstreams` 列表，在 schema 中标记 `upstream_id` 字段使用 `select` 控件。这需要修改 PluginEditorDrawer 支持 `component` 覆盖或新增 `select` 类型渲染分支。
- **传递上游列表**：在 `ClusterList.vue` 中通过 `availableUpstreams` 计算属性获取上游列表，传递给 PluginSelector → PluginEditorDrawer。

## Risks / Trade-offs

- **前端改动范围**：PluginEditorDrawer 当前没有 `select` 类型的渲染分支，需要新增。但该组件已支持 `enum` 类型下拉，可复用类似逻辑。
- **已有数据兼容**：已保存的 `response_rewrite` 配置使用旧 schema 结构，刷新页面加载后表单会按新 schema 渲染，但不影响已保存的 JSON 数据本身（JSON 模式仍可编辑）。
