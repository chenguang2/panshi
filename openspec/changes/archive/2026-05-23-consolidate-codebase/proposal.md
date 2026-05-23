## Why

代码库经过多次迭代和重构，积累了大量重复代码和死代码。前端 6 个资源 composable 的 publish/delete 函数几乎完全一样（copy-paste），后端 `EdgeLogger` 和 `EdgeClient` 也有 5-29 个近相同的方法。`ClusterList.vue` 重构后残留了约 265 行无用内联弹窗。这些重复导致维护成本高、bug 修复需要改多处、新功能开发容易遗漏。

## What Changes

- **清理 ClusterList.vue 死代码**：删除重构残留的 7 个内联弹窗/抽屉和未使用的 composable 解构
- **前端 publish/delete 统一**：将 publish 进度弹窗和 delete 确认回调抽取到 `useClusterUtils.ts`
- **后端 EdgeLogger 统一**：5 个 `log_xxx_operation` 合并为 1 个参数化方法
- **后端 EdgeClient 统一**：EdgeClient 类中 29 个资源方法合并为通用 `resource_request` 方法

## Capabilities

### New Capabilities

- `shared-publish-flow`: 前端统一发布流程，所有资源类型共用 publish 进度弹窗和 delete 确认对话框逻辑
- `unified-edge-logger`: 后端 EdgeLogger 5 个日志方法合并为 1 个参数化方法
- `unified-edge-client`: 后端 EdgeClient 资源操作方法统一

### Modified Capabilities

- （无 spec 级别行为变更，仅重构实现）

## Impact

- 前端：`useClusterUpstreams.ts`、`useClusterRoutes.ts`、`useClusterPluginConfigs.ts`、`useClusterGlobalRules.ts`、`useClusterStaticResources.ts`、`useClusterUtils.ts`、`ClusterList.vue`
- 后端：`edge_logger.py`、`edge_client.py`、`edge_client.py`（api/v1/）
- 预计删除重复代码约 1500 行，无功能变更
