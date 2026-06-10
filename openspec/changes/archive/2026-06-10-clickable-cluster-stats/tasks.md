## 1. ClusterList.vue — 卡片统计改为可点击链接

- [x] 1.1 将 `.cl-card-stats` 中的统计数字从纯文本改为 `<router-link>`，点击跳转到对应资源页面并携带 `?cluster_id={c.id}` query 参数
- [x] 1.2 所有 7 项统计（含节点"健康/总数"格式）均改为 `<router-link>`

## 2. 资源列表页面 — 接收 cluster_id query 参数

- [x] 2.1 RouteList.vue: `onMounted` 中读取 `route.query.cluster_id`，自动设置 `clusterFilter` 并调用 `loadRoutes()`
- [x] 2.2 UpstreamList.vue: 同上逻辑
- [x] 2.3 NodeList.vue: 同上逻辑
- [x] 2.4 PluginConfigList.vue: 同上逻辑
- [x] 2.5 GlobalRuleList.vue: 同上逻辑
- [x] 2.6 PluginMetadataList.vue: 同上逻辑
- [x] 2.7 StaticResourceList.vue: 同上逻辑

## 3. 验证

- [ ] 3.1 点击路由统计跳转到路由页面，确认集群过滤自动选中
- [ ] 3.2 直接访问路由页面（无 cluster_id），确认默认为"全部集群"
- [ ] 3.3 右键统计链接，确认可"在新标签页打开"
- [x] 3.4 确认 `vue-tsc --noEmit` 无类型错误
