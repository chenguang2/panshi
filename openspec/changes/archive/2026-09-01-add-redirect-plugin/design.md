## Context

磐石 Gateway 的插件系统通过 `BUILTIN_PLUGINS` 列表定义所有支持的插件，每个插件包含 `name`、`display_name`、`category`、`description`、`schema` 等字段。前端 PluginEditorDrawer 基于 schema 自动生成表单，无需为每个插件单独写 UI。

当前缺少 APISIX `redirect` 插件，用户无法配置 HTTP 重定向行为。

## Goals / Non-Goals

**Goals:**
- 注册 redirect 插件，使路由/全局规则/插件配置可使用该插件
- 表单编辑器完整支持 redirect 的所有字段
- 字段约束（互斥关系）通过 schema hints 提示用户

**Non-Goals:**
- 不修改 PluginEditorDrawer 组件（通用 schema 渲染已支持）
- 不做 redirect 逻辑的后端验证（Edge 节点执行，平台仅透传配置）

## Decisions

1. **分类归入 `rewrite`**：redirect 本质是 URI 重写/跳转，与 `proxy_rewrite`、`cors` 同类
2. **`enable_metadata: False`**：redirect 无需全局元数据配置
3. **`regex_uri` 用 `array[2]` 表达**：APISIX 只支持一个正则对，前端渲染为两行输入
4. **互斥约束在 schema hints 中说明**：`http_to_https`、`uri`、`regex_uri` 三选一，通过 hints 文字提示，不做运行时互斥校验（与 APISIX 行为一致）

## Risks / Trade-offs

- [互斥字段可能被同时填写] → APISIX 侧会按优先级处理，平台不做额外限制
- [regex_uri JSON 编辑时格式要求严格] → 已有 JSON 模式兜底
