## Why

当前资源列表页（路由、上游、节点、插件组、全局规则、插件元数据、静态资源、四层代理）在分组过滤模式下存在数据丢失问题：前端一次取回 500 条记录后做客户端过滤，当全局记录超过 500 条时，分组结果静默截断。同时，表单下拉选择器（上游、路由、节点）使用 `page_size: 100`，超过 100 项的选项不可见。

这些问题的原因是系统缺乏后端 `group_name` 过滤能力，以及下拉选择器采用固定 `page_size` 而非全覆盖或远程搜索模式。

## What Changes

1. **New API capability**: 所有全局列表端点新增可选的 `group_name` 查询参数，在后端 SQL 层面按分组过滤
2. **Frontend list pages**: 移除 `GROUP_MODE_PAGE_SIZE=500` 客户端过滤模式，改为传递 `group_name` 参数使用服务端分页
3. **Dropdown selectors**: 表单下拉选择器的 `page_size` 统一提升至 `MAX_PAGE_SIZE=500`，确保完整展示所有选项
4. **Spec update**: 更新 `group-filter-on-resource-pages` spec，从"纯客户端过滤"改为"服务端 group_name 过滤"

## Capabilities

### New Capabilities
- `group-name-api-filter`: 后端所有全局列表 API 支持 `group_name` 查询参数进行服务端过滤

### Modified Capabilities
- `group-filter-on-resource-pages`: 分组过滤从"纯前端实现、不改后端"改为"后端 `group_name` 查询参数 + 前端传递参数"，消除 500 条截断风险。同时 `table-pagination` spec 中关于分组模式下翻页行为的部分需要同步更新。

## Impact

- **Backend**: 8 个全局列表路由文件（routes.py, upstreams.py, nodes.py, plugin_configs.py, global_rules.py, plugin_metadata.py, static_resources.py, cluster_stream_proxies.py）新增 `group_name: Optional[str]` 查询参数，模型层做 Cluster JOIN 过滤
- **Frontend**: 8 个列表视图移除 `GROUP_MODE_PAGE_SIZE` 模式和客户端过滤逻辑；5 个表单/选择器文件调整 `page_size`
- **Specs**: `group-filter-on-resource-pages` spec 需要 delta 更新，"纯客户端"的设计决策改为服务端过滤
- **Database**: `groups` 表建议加索引 `idx_cluster_group_name`
