## Why

Edge 网关的 `security_common_body` 插件提供了对请求体内容的黑名单关键字匹配与拦截能力，可用于防护 SQL 注入、XSS、路径遍历、命令执行等攻击。当前磐石 Admin 的内置插件列表中缺少该插件，导致路由和插件组无法配置 body 安全检查能力。

## What Changes

- 在系统内置插件注册列表 `BUILTIN_PLUGINS` 中添加 `security_common_body` 插件，包含完整的参数 schema
- 在前端插件选择器中新增「安全防护」分类，将 `security_common_body` 归入该分类

## Capabilities

### New Capabilities
- `security-common-body-plugin`: 支持在路由和插件组中配置 security_common_body 插件，提供 denylist（黑名单）、maxsize（请求体大小限制）、status（拦截状态码）、message（拦截提示）、bypass_hugebody（大请求体绕过）等参数的表单编辑与 JSON 编辑

### Modified Capabilities

（无）

## Impact

- **后端**：`backend/app/api/v1/plugins.py` — `BUILTIN_PLUGINS` 列表新增条目
- **前端**：`frontend/src/components/PluginSelector.vue` — CATEGORIES 新增「安全防护」分组
- **无数据库变更**，无 API 接口变更
