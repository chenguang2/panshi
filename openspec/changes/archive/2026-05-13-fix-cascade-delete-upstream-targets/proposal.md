## Why

删除上游/路由/插件组/全局规则时，由于 SQLite 异步引擎未启用外键级联，关联表（UpstreamTarget、RoutePlugin、ConfigVersion）记录残留，导致新建资源时出现旧数据。

## What Changes

- `delete_upstream` 增加显式删除 UpstreamTarget + ConfigVersion
- `delete_route` 增加显式删除 RoutePlugin + ConfigVersion
- `delete_plugin_config` 增加显式删除 ConfigVersion
- `delete_global_rule` 增加显式删除 ConfigVersion
