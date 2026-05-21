## Context

磐石 Admin 通过 `BUILTIN_PLUGINS` 列表集中管理系统支持的所有内置 Edge 插件，前端 `PluginSelector.vue` 根据后端返回的插件列表动态渲染插件选择器。新增一个插件需要同时在两端注册。

`security_common_body` 是 Edge 网关的安全类插件，用于检查 HTTP 请求体内容，通过正则黑名单匹配来拦截恶意请求。其参数包括：`denylist`（黑名单正则数组）、`maxsize`（最大 body 大小）、`status`（拦截状态码）、`message`（拦截提示）、`bypass_hugebody`（超限时是否放行）。

## Goals / Non-Goals

**Goals:**
- 在 `BUILTIN_PLUGINS` 中注册 `security_common_body`，定义完整的参数 schema（类型、默认值、描述、示例、提示）
- 在前端插件选择器中让该插件可见可配置，归入「安全防护」分类

**Non-Goals:**
- 不涉及数据库表变更或 API 接口变更
- 不创建新的前端页面或路由
- 不修改其他已有插件的配置或行为

## Decisions

- **schema 格式沿用现有模式**：与 `proxy_rewrite`、`traffic_limit_count` 等插件一致，使用 `type` / `default` / `description` / `examples` / `hints` 字段描述各参数。`denylist` 使用 `array` 类型并在前端渲染为多行文本域，与 `log_process.logs` 等数组字段一致。
- **分类归属「安全防护」**：现有分类（流量控制、请求/响应重写、数据处理、静态资源、监控）中没有安全类。考虑到 docs 中还有 `security_common_args`、`security_common_uri` 等系列插件，新增「安全防护」分类便于后续扩展。
- **`enable_metadata` 设为 false**：该插件不需要插件元数据模板支持，配置直接在路由或插件组中内联。

## Risks / Trade-offs

- **前端分类硬编码**：`PluginSelector.vue` 中的 CATEGORIES 是静态数组，新增分类需要手动维护。当前无插件类型字段支持自动分类，手动维护是目前合理的折衷。
- **无数据库变更风险**：本项目风险较低 — 仅修改静态配置和前端视图，不涉及数据持久化。
