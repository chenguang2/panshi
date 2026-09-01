## Why

系统需要支持 APISIX 的 `redirect` 插件，用于配置 HTTP 重定向（如 HTTP→HTTPS 强制跳转、URI 正则重写等）。当前插件列表中缺少该插件，用户无法在路由/全局规则中配置重定向行为。

## What Changes

- 在 `backend/app/config/plugin_definitions.py` 的 `BUILTIN_PLUGINS` 中新增 `redirect` 插件定义
- 插件 schema 基于 APISIX 官方 redirect 插件文档，包含以下字段：
  - `http_to_https`：HTTP→HTTPS 重定向（boolean，默认 false）
  - `uri`：目标重写 URI，支持 Nginx 变量（string）
  - `regex_uri`：正则匹配+替换的 URI 数组（array[2]，正则 + 模板）
  - `ret_code`：重定向状态码（integer，默认 302）
  - `encode_uri`：是否对 Location URI 做 RFC3986 编码（boolean，默认 false）
  - `append_query_string`：是否追加原始请求 query string（boolean，默认 false）
- 约束：`http_to_https`、`uri`、`regex_uri` 三选一互斥；`http_to_https` 与 `append_query_string` 互斥

## Capabilities

### New Capabilities
- `redirect-plugin`: 在插件系统中注册 redirect 插件，使其可在路由插件配置、全局规则、插件配置中使用，表单编辑器支持所有字段的表单模式和 JSON 模式

### Modified Capabilities
（无）

## Impact

- `backend/app/config/plugin_definitions.py`：BUILTIN_PLUGINS 新增一项
- 前端 PluginEditorDrawer 无需改动（通用表单渲染基于 schema 自动生成）
- 插件开关页面自动识别新插件（基于 BUILTIN_PLUGINS 列表）
