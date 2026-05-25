## Why

集群管理的路由、节点、上游三个 Tab 的搜索框独占一行浪费空间，且列配置在刷新后丢失，每次需重新设置。

## What Changes

- 路由/节点/上游 Tab 的搜索框移到工具栏右侧，与按钮同行
- 三个 Tab 的列配置、搜索可见性、操作按钮选择持久化到 localStorage
- 插件元数据 Tab 去掉搜索框

## Capabilities

### New Capabilities
- `table-toolbar-ux`: 表格工具栏搜索框位置优化与列配置持久化

### Modified Capabilities
（无）

## Impact

- `ClusterRoutes.vue` / `ClusterNodes.vue` / `ClusterUpstreams.vue` — 搜索框移到工具栏
- `useClusterRoutes.ts` / `useClusterNodes.ts` / `useClusterUpstreams.ts` — localStorage 持久化
- `PluginMetadata.vue` — 移除搜索框
