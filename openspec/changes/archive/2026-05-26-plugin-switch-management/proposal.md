## Why

不同环境的用户需要的插件不同，目前所有内置插件全部展示，无法按需隐藏不必要的插件。

## What Changes

- 新增 `ps_plugin_enabled` 数据库表，存储插件启用状态
- 新增 `GET/PUT /api/v1/plugin-switches` API
- `GET /api/v1/plugins/builtin` 根据开关过滤，可选 `?all=1` 返回全部
- 前端系统管理新增「插件管理」页面，支持勾选启用/禁用

## Impact

- `backend/app/models/cluster.py` — PluginEnabled 模型
- `backend/app/api/v1/plugin_switches.py` — 新增 API
- `backend/app/api/v1/plugins.py` — 过滤逻辑
- `frontend/src/views/PluginSwitches.vue` — 管理页面
- `frontend/src/router/index.ts` — 路由
- `frontend/src/views/DefaultLayout.vue` — 菜单
