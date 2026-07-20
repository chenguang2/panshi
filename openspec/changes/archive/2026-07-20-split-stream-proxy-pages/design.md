## Context

当前 `StreamProxyList.vue`（~442 行）同时展示 `proxy_type=normal`（TCP/UDP）和 `proxy_type=dns` 两种代理。侧边栏一个入口，页面卡片逻辑通过 `v-if="proxy_type !== 'dns'"` 分支。

## Goals / Non-Goals

**Goals:**
- 侧边栏拆分：TCP代理 / DNS代理 两个独立入口
- composable 抽取共享逻辑，两页面通过 composable 复用
- 后端 API 支持 `proxy_type` 参数过滤
- 现有表单/查看/发布组件不修改

**Non-Goals:**
- 不合并或删除后端 StreamProxy 数据模型
- 不修改 StreamProxyFormWizard 表单组件
- 不涉及数据库变更

## Decisions

### 1. `useStreamProxyList` composable 接口

```typescript
export function useStreamProxyList(proxyType: Ref<'normal' | 'dns'>) {
  // 返回所有共享状态和操作
}
```

接收 `Ref` 类型而非原始值，使 composable 能响应 `route.query.type` 的变化。

包含：
- 响应式状态：proxies, loading, totalCount, searchText, filters
- 计算属性：pageTitle, pageDesc, displayedProxies, groupOptions
- 方法：loadProxies, loadClusters, openCreateWizard, editProxy, deleteProxy, publishProxyAction
- 组件状态：wizardVisible, editingProxy, viewDrawerVisible, viewingProxy
- 工具函数：schemeLabel, lbLabel, formatDate

### 2. 单页面 + 路由参数过滤

`StreamProxyList.vue` 通过 `route.query.type` 控制显示类型：

```typescript
const proxyType = computed<'normal' | 'dns'>(() => 
  route.query.type === 'dns' ? 'dns' : 'normal'
)
const { ... } = useStreamProxyList(proxyType)
```

页面内现有卡片 `v-if` 分支保持不变（`p.proxy_type !== 'dns'` / `p.proxy_type === 'dns'`），通过 API 过滤后每种类型页面只展示对应数据。

### 3. 路由与侧边栏

```typescript
// 单路由，侧边栏通过 query 参数区分
{ path: 'stream-proxies', name: 'StreamProxyList', component: StreamProxyList },

// 侧边栏两个菜单
{ label: 'TCP代理', route: '/stream-proxies?type=normal', feature: 'stream_proxy' }
{ label: 'DNS代理', route: '/stream-proxies?type=dns', feature: 'stream_proxy' }
```

`isActive()` 判断逻辑：`route.path === '/stream-proxies'` 且 `route.query.type` 匹配。

### 4. 后端 API 扩展

`GET /api/v1/stream-proxies` 新增可选参数：

```python
proxy_type: Optional[str] = Query(None, regex="^(normal|dns)$")
```

## Risks / Trade-offs

- [低] 两个页面模板有一定重复（卡片列表结构相似）——通过保持一致的结构简化维护
- [低] `feature_routers` 中 stream_proxy 控制两个入口同时开/关——目前符合需求，未来可分拆
