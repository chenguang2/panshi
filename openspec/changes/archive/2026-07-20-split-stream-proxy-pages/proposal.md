## Why

当前四层代理（TCP/UDP）和 DNS 代理合并在同一个页面 `StreamProxyList.vue` 中，左侧菜单只有一个入口"四层代理"。随着两种代理类型功能差异扩大，同一页面混合展示增加了用户查找成本和页面复杂度。需要拆分为两个独立入口。

## What Changes

1. **新增 `useStreamProxyList` composable** — 从 `StreamProxyList.vue` 中抽取所有共享逻辑（加载、筛选、CRUD、发布、版本管理）
2. **侧边栏拆分** — "四层代理" → "TCP代理" + "DNS代理" 两个菜单项，指向同一页面通过 `?type=` 参数区分
3. **`StreamProxyList.vue` 根据 `route.query.type` 过滤** — `type=normal` 时只显示 TCP 代理，`type=dns` 时只显示 DNS 代理
4. **后端 API** — `GET /stream-proxies` 新增 `proxy_type` 查询参数
5. **保留现有组件** — `StreamProxyFormWizard.vue`、`StreamProxyViewDrawer.vue` 等不需要修改

## Capabilities

### New Capabilities
- `tcp-proxy-list`: TCP 代理独立列表页
- `dns-proxy-list`: DNS 代理独立列表页

### Modified Capabilities
- `stream-proxy-management`: 页面拆分，composable 抽取

## Impact
- `frontend/src/composables/useStreamProxyList.ts` — 新增 composable
- `frontend/src/views/StreamProxyList.vue` — 改用 composable + `route.query.type` 过滤
- `frontend/src/router/index.ts` — `stream_proxy` 路由保留，支持 `?type=` query
- `frontend/src/components/AppSidebar.vue` — 菜单项拆分为 TCP代理/DNS代理
- `backend/app/api/v1/cluster_stream_proxies.py` — 新增 `proxy_type` 查询参数
