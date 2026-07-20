## 1. Backend — API 新增 proxy_type 参数

- [x] 1.1 在 `cluster_stream_proxies.py` 的 `global_router` 列表接口中增加可选 `proxy_type` 查询参数，过滤 `StreamProxy.proxy_type`

## 2. Composable — 抽取共享逻辑

- [x] 2.1 新建 `frontend/src/composables/useStreamProxyList.ts`，从 `StreamProxyList.vue` 中抽取全部 script 逻辑（状态、加载、CRUD、工具函数），接收 `proxyType: Ref<'normal' | 'dns'>` 参数
- [x] 2.2 标题/描述等文案根据 `proxyType` 动态计算
- [x] 2.3 API 请求参数中传入 `proxy_type: proxyType.value`

## 3. StreamProxyList.vue 适配

- [x] 3.1 改用 `useStreamProxyList` composable，从 `route.query.type` 推导 `proxyType`
- [x] 3.2 调整 PageHeader 标题和描述为动态文案
- [x] 3.3 调整新建按钮文案为动态

## 4. 路由 & 侧边栏

- [x] 4.1 `frontend/src/components/AppSidebar.vue`：将"四层代理"替换为"TCP代理"和"DNS代理"两个菜单项，route 带 `?type=` 参数
- [x] 4.2 更新 `isActive()` 函数，支持 `/stream-proxies?type=normal` 和 `/stream-proxies?type=dns` 的高亮匹配
