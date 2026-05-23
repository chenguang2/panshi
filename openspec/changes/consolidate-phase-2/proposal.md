## Why

代码库中 delete 操作的回调和 publish 操作的 node 迭代循环存在大量重复代码。前端 5 个 composable 的 delete progress 回调各有 100+ 行且几乎相同，后端 6 个 publish endpoint 的 node 迭代循环也是 copy-paste。这些重复导致修改要改 5-6 处，容易遗漏。

## What Changes

- 前端: 统一 delete 操作的进度弹窗回调，提取 `executeDeleteWithProgress` 到 `useClusterUtils.ts`
- 后端: 统一 publish 操作的 node 迭代循环，提取 `_publish_to_nodes` 到共享辅助函数

## Capabilities

### New Capabilities

- `unified-delete-progress`: 前端统一删除进度弹窗回调，所有资源 composable 共用
- `unified-publish-node-loop`: 后端统一 publish 的 node 迭代 + 日志 + 错误处理

### Modified Capabilities

- （无 spec 级别变更）

## Impact

- 前端: `useClusterUtils.ts`、`useClusterUpstreams.ts`、`useClusterRoutes.ts`、`useClusterPluginConfigs.ts`、`useClusterGlobalRules.ts`、`useClusterStaticResources.ts`
- 后端: `clusters.py`、`routes.py`、`plugin_metadata.py`、`static_resources.py`
- 预计删除重复代码约 600 行，无功能变更
