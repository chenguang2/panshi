# Proposal

## Why

路由保存成功后仅提示「路由已更新 / 路由已添加 / 路由已创建 / 路由已复制」，没有任何「配置尚未下发 Edge 节点」的语义，也不像上游域那样在保存后提供「立即发布 / 稍后」引导。用户会把保存误读为"已生效"，随后按新配置验证流量却仍是旧行为（后端 `pending_publish` 推导本身正确、列表「待发布」标签照常显示，但该页长期几乎全行为待发布，标签已不构成"刚改过"的信号）。同样的语义在上游域（`UpstreamFormModal` / `useClusterUpstreams`）与插件组域（文案部分）早已收口，路由域是遗漏入口。

## What Changes

- **全局路由页保存反馈**（`RouteFormModal.vue` + `RouteList.vue`）
  - 新建 / 编辑 / 复制三个保存分支的成功 toast 统一为「已保存。配置尚未发布，需发布后才会在 Edge 节点生效」（与上游域同一文案）。
  - 保存成功后经 `useOverlayModal` 弹出引导：「配置尚未发布，发布后才会推送到 Edge 节点生效。」，出口为「稍后」「立即发布」。
  - 「立即发布」经 `emit('publish-requested')` 交父页打开既有 `PublishConfirmModal` 并走既有发布链路；系统 SHALL NOT 未经用户确认自动发布。
- **集群路由 Tab 保存反馈**（`useClusterRoutes.ts`，服务集群详情页与统一管理展开面板）
  - 文案同款统一；保存后刷新集群路由列表使「待发布」立即可见。
  - 保存成功后弹同款引导，「立即发布」复用 `useClusterResourceCore.publishByRecord` → 既有 `openPublishModal` / `executePublish` 链路。
- **DNS 查询路由例外**：`plugin_name === 'dns_upstream'` 的路由，引导弹窗 SHALL NOT 提供「立即发布」出口，SHALL 提示「DNS 路由请在『DNS 代理』页管理」；既有行内发布/编辑整行禁用语义保持不变（双入口一致）。
- **不改动**：后端 `pending_publish` 推导与列表端点、`PublishConfirmModal` / `executePublish` / 版本管理链路、上游域既有行为；不新增接口与数据库列。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `route-management`: 新增「保存后发布引导」需求（全局路由页新建/编辑/复制三个保存入口的未发布语义与引导出口、DNS 路由例外）。
- `cluster-routes-component`: 新增「保存后发布引导」需求（集群路由 Tab 同款语义，与独立页一致）。

## Impact

- 前端代码：`frontend/src/components/RouteFormModal.vue`、`frontend/src/views/RouteList.vue`、`frontend/src/composables/useClusterRoutes.ts`。
- 前端测试：`RouteFormModal` / `RouteList` / `useClusterRoutes` 既有测试文件补用例（含 DNS 路由不给「立即发布」、`emit` 载荷、toast 文案）。
- 后端：无改动（`cluster_routes.py` 的 `pending_publish` 推导与发布时间回查已正确，列表端点不新增字段）。
- 数据与迁移：无 schema 变更，不涉及 PG 方言冒烟触发条件。
- 用户可见变化：路由两个保存入口的保存反馈从「已更新」变为「已保存但未生效」并新增发布引导弹窗；其他资源域行为不变（四层代理 / DNS 代理 / SSL / 静态资源 / 插件组的同类缺口留待后续批次）。
