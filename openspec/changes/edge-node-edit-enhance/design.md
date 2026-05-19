## Context

当前边缘节点管理界面（`EdgeClient.vue`）有 6 个 Tab：上游、路由、全局规则、插件组、插件元数据、插件列表。其中全局规则、插件组、插件元数据的编辑功能已完整实现（前端 PATCH 调用 + 后端端点均已就绪），但上游和路由的编辑功能未完成。

后端 PUT 端点（全量更新）已存在，但前端编辑提交仅显示占位消息。另有个别资源缺少 PATCH 端点（部分更新），服务层方法也尚未暴露。

## Goals / Non-Goals

**Goals:**
- 上游编辑：前端 `handleUpstreamSubmit` 编辑模式改为调用 `PUT .../upstreams/{id}`
- 路由编辑：前端 `handleRouteSubmit` 编辑模式改为调用 `PUT .../routes/{id}`
- 后端新增上游 `PATCH .../upstreams/{id}` 端点（服务层 `patch_upstream` 已就绪）
- 后端新增路由 `PATCH .../routes/{id}` 端点及服务层 `patch_route` 方法
- 后端新增插件元数据 `PATCH .../plugin_metadata/{name}` 端点及服务层 `update_plugin_metadata` 方法

**Non-Goals:**
- 不涉及全局规则和插件组的修改（已完整实现）
- 不删改现有创建/删除逻辑
- 不增加新的数据库表或模型
- 不涉及其他管理页面（集群管理、仪表盘等）

## Decisions

1. **上游编辑使用 PUT 全量更新** — 前端编辑提交调用 `PUT .../upstreams/{id}`，后端已有 `UpstreamUpdate` schema
2. **路由编辑使用 PUT 全量更新** — 前端编辑提交调用 `PUT .../routes/{id}`，后端已有 `RouteUpdate` schema
3. **PATCH 端点作为补充** — PUT 已能完成编辑功能，增加 PATCH 端点是为了与其他资源（全局规则、插件组）的 API 设计一致，支持部分字段更新
4. **前端表单数据复用创建逻辑** — 编辑模式下，表单字段与创建模式一致，只需将 HTTP 方法从 POST 改为 PUT，URL 附带资源 ID

## Risks / Trade-offs

- [前端提交数据格式] PUT 更新需要与 POST 创建使用相同的 payload 格式 → 复用已有 payload 构建逻辑，无需额外转换
- [后端 PUT 是幂等的] PUT 更新覆盖全部字段，不会出现部分更新丢失字段的情况
- [PATCH 端点在 Edge 端的支持] APISIX Admin API 是否支持 PATCH → 已确认全局规则和插件组的 PATCH 端点正常工作，上游和路由同理
