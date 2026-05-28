## Why

系统缺少基于 OWASP Core Rule Set 的 WAF 安全引擎插件。

## What Changes

- BUILTIN_PLUGINS 新增 security_corerule 插件
- 前端「安全防护」分类添加该插件

## Impact

- `backend/app/api/v1/plugins.py`
- `frontend/src/components/PluginSelector.vue`
