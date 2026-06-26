## 1. NodeList.vue — 增加分组筛选

- [x] 1.1 添加 `groupFilter` ref 和 `groupOptions`、`filteredClusters` computed
- [x] 1.2 在 cluster 筛选 select 前插入分组 select
- [x] 1.3 集群筛选选项改为使用 `filteredClusters`

## 2. UpstreamList.vue — 增加分组筛选

- [x] 2.1 添加 `groupFilter` ref 和 `groupOptions`、`filteredClusters` computed
- [x] 2.2 在 cluster 筛选 select 前插入分组 select
- [x] 2.3 集群筛选选项改为使用 `filteredClusters`

## 3. RouteList.vue — 增加分组筛选

- [x] 3.1 添加 `groupFilter` ref 和 `groupOptions`、`filteredClusters` computed
- [x] 3.2 在 cluster 筛选 select 前插入分组 select
- [x] 3.3 集群筛选选项改为使用 `filteredClusters`
- [x] 3.4 确保 cluster 变化时 upstream 联动仍正常工作

## 4. PluginConfigList.vue — 增加分组筛选

- [x] 4.1 添加 `groupFilter` ref 和 `groupOptions`、`filteredClusters` computed
- [x] 4.2 在 cluster 筛选 select 前插入分组 select
- [x] 4.3 集群筛选选项改为使用 `filteredClusters`

## 5. StreamProxyList.vue — 增加分组筛选

- [x] 5.1 添加 `groupFilter` ref 和 `groupOptions`、`filteredClusters` computed
- [x] 5.2 在 cluster 筛选 select 前插入分组 select
- [x] 5.3 集群筛选选项改为使用 `filteredClusters`

## 6. GlobalRuleList.vue — 增加分组筛选

- [x] 6.1 添加 `groupFilter` ref 和 `groupOptions`、`filteredClusters` computed
- [x] 6.2 在 cluster 筛选 select 前插入分组 select
- [x] 6.3 集群筛选选项改为使用 `filteredClusters`

## 7. StaticResourceList.vue — 增加分组筛选

- [x] 7.1 添加 `groupFilter` ref 和 `groupOptions`、`filteredClusters` computed
- [x] 7.2 在 cluster 筛选 select 前插入分组 select
- [x] 7.3 集群筛选选项改为使用 `filteredClusters`

## 8. EdgeEnv.vue — 增加分组筛选 + 搜索框 + 平铺布局

- [x] 8.1 添加搜索输入框 + 搜索逻辑
- [x] 8.2 将 filter bar 从 label 式改为平铺式（搜索 → 分组 → 集群 → 节点）
- [x] 8.3 添加 `groupFilter` ref 和 `groupOptions`、`filteredClusters` computed
- [x] 8.4 集群选项改为使用 `filteredClusters`

## 9. Verification

- [x] 9.1 npm run build — clean build
- [ ] 9.2 后续人工检查（分组+集群联动）
- [ ] 9.3 后续人工检查 RouteList 联动链
- [ ] 9.4 后续人工检查 EdgeEnv
