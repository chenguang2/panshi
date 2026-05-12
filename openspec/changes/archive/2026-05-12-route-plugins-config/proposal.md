## Why

现有 `plugins.py` 仅包含 10 个基础插件，缺少 `traffic_split`、`data_center`、`log_process`、`traffic_limit_count`、`pre_functions` 等常用插件，且 `proxy_rewrite` 和 `response_rewrite` 的 schema 不完整（缺少 `method`、`body`、`regex_body` 等字段）。

## What Changes

- 新增 5 个插件: `traffic_split`, `data_center`, `log_process`, `traffic_limit_count`, `pre_functions`
- 增强 2 个已有插件: `proxy_rewrite`（补充 4 个字段）, `response_rewrite`（补充 3 个字段）

## Capabilities

### New Capabilities
- `route-plugins-config`: 路由插件配置定义，为前端插件选择器提供 schema

### Modified Capabilities
<!-- None -->

## Impact

- `backend/app/api/v1/plugins.py` — `BUILTIN_PLUGINS` 列表
