## Context

配置对比 `clusters.py:diff_cluster_config` 函数中存在多个 bug：
1. 插件元数据从 Edge 拉取时，用 `_edge_val(p).get("name", "")` 提取键名，但 Edge 返回的 value 中不含 name 字段
2. 插件元数据对比时，用 `edge_data.get("config", {})` 取数据，但 Edge 返回的就是原始配置数据
3. 路由对比只比较了 5 个标量字段，遗漏了 vars、plugin_config_ids、RoutePlugin

## Decisions

- 插件元数据键名从节点 key 路径中提取（`key.rsplit("/", 1)[-1]`）
- 路由插件复用 `compare_plugins` 引擎，与 plugin_config 共用 defaults
- 全选使用简单 computed + toggle 函数，不引入额外组件

## Risks / Trade-offs

- RoutePlugin 使用 `_get_all(RoutePlugin)` 无过滤，数据量大时可能影响性能
