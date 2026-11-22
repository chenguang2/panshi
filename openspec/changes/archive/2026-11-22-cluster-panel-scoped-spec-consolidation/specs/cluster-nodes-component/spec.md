## REMOVED Requirements

### Requirement: ClusterNodes component

**Reason**: 载体已删除（2026-11-22 面板 Tab = 独立页组件 scoped 单实现，见 `AGENTS.md #93`）。
**Migration**: 面板「集群节点」Tab 现直接渲染 `views/NodeList.vue` 的 `scopedClusterId` 形态；行为要求见 `cluster-panel-scoped-tabs`。

