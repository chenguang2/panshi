## Context

集群管理页面（`views/ClusterList.vue`）的集群卡片底部展示各资源统计数字（节点、上游、路由、插件组、全局规则、插件元数据、静态资源），目前均为纯文本显示。每个资源类型都有独立的列表管理页面（`RouteList.vue`、`UpstreamList.vue`、`NodeList.vue` 等），这些页面的顶部都有一个集群过滤下拉框，默认值为"全部集群"。

用户要从集群卡片跳转到某资源列表并查看特定集群的数据时，需要：先导航到目标页面 → 再手动下拉选择集群 → 等待数据加载。操作路径长，尤其在集群数量多时体验差。

## Goals / Non-Goals

**Goals:**
- 集群卡片上的统计数字变为可点击链接
- 点击后跳转到对应资源列表页面，URL 携带 `?cluster_id=X` 参数
- 资源列表页在 `onMounted` 时检测 `cluster_id` 参数，自动设置集群过滤下拉框并加载对应数据
- 覆盖 7 个资源类型：节点（含健康/总数格式）、上游、路由、插件组、全局规则、插件元数据、静态资源
- 每项统计数字整体作为可点击链接，节点统计的"3/5"等格式也整体作为链接

**Non-Goals:**
- 不改动集群详情弹窗（detail modal）中的统计，仅改动卡片上的统计
- 不改动报表/仪表盘页面
- 不新增页面或路由
- 不改动后端 API

## Decisions

### Decision 1: 使用 `<router-link>` + query 参数传递 cluster_id

卡片上的统计数据改为 `<router-link :to="{ path: '/routes', query: { cluster_id: c.id } }">` 形式。

**为什么不是 `@click` + `router.push`？** `<router-link>` 支持右键新标签打开、中键等浏览器原生行为，用户体验更好。同理，`query` 参数而非 `params` 是因为 query 不耦合路由 path 结构，各资源页面已有的 `clusterFilter` 逻辑可直接复用。

### Decision 2: 各资源列表页在 onMounted 中读取 query.cluster_id

每个资源列表页（`RouteList.vue`、`UpstreamList.vue` 等）在 `onMounted` 中：

```typescript
import { useRoute } from 'vue-router'

const route = useRoute()

onMounted(() => {
  const clusterId = route.query.cluster_id
  if (clusterId) {
    clusterFilter.value = String(clusterId)
    loadXxx() // 触发带 cluster_id 的数据加载
  }
  loadClusters()
})
```

这样既支持从集群卡片跳转进来自动选中，又不影响直接访问页面（无 `cluster_id` 时默认"全部集群"）。

**为什么不改成 `watch`？** 避免在页面内手动切换集群时被 query 参数覆盖。`onMounted` 仅在首次加载时读取一次 query，后续用户手动切换过滤不受影响。

### Decision 3: 节点统计也作为链接，整体文案可点击

节点统计显示为 `健康/总数` 格式（如 `3/5`），与其他单项数字格式不同。但为保持功能一致性和用户体验，节点统计也整体作为链接，点击跳转到 `/nodes?cluster_id=X`。

### Decision 4: 只修改集群卡片上的统计行（cl-card-stats），不修改详情弹窗

`ClusterList.vue` 第 48-56 行的 `.cl-card-stats` 区域改为链接形式。详情弹窗中的统计（第 101-109 行）保持纯文本不变——详情弹窗是概览性质，用户预期在此处查看而非导航。

## Risks / Trade-offs

- [Low] 用户从资源列表页手动导航到其他页再返回时，URL query 参数会消失，恢复到"全部集群"——这是预期行为，因为 query 只在跳转时携带
- [Low] 需要确认每个资源列表页的 `loadClusters` 不会覆盖 `clusterFilter` —— 目前各页面的 `loadClusters` 只填充下拉选项，不重置 `clusterFilter`，所以无冲突
- [Low] `router-link` 的样式需要与纯文本视觉协调，避免看起来像按钮而不是链接
- [Low] 如果 cluster_id 对应集群已被删除，过滤下拉框显示空值，API 返回空列表。用户可手动切换回"全部集群"解决。
