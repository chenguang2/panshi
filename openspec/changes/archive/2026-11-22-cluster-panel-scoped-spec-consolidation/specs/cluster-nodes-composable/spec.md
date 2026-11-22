## REMOVED Requirements

### Requirement: useClusterNodes composable

**Reason**: 载体已删除（2026-11-22 面板 Tab = 独立页组件 scoped 单实现，见 `AGENTS.md #93`）。
**Migration**: 该 composable 仅保留活路径（`loadNodes` 供 `ClusterCard` 节点预览、`nginxState`/`nodeCellRuntime`/批量动作），面板列表/CRUD/安装流由 `NodeList.vue` 自持。

