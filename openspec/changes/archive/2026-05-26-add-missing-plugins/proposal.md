## Why

系统内置插件列表缺少 13 个 Edge 网关支持的安全、认证和 CORS 插件，路由和插件组无法配置这些能力。

## What Changes

- BUILTIN_PLUGINS 新增 13 个插件：auth_basic, auth_key, cors, security_common_args/cookie/referer/uri/useragent, security_restrict_ip/uri/form, security_super_ip/user
- 前端新增「认证」分类，更新「安全防护」分类列表

## Impact

- `backend/app/api/v1/plugins.py` — 新增 13 个插件定义
- `frontend/src/components/PluginSelector.vue` — 更新分类
