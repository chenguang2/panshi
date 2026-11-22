## REMOVED Requirements

### Requirement: ClusterStaticResources component

**Reason**: 载体已删除（2026-11-22 面板 Tab = 独立页组件 scoped 单实现，见 `AGENTS.md #93`）。
**Migration**: 面板「静态资源」Tab 现直接渲染 `views/StaticResourceList.vue`（`scopedClusterId`），与独立页完全同构；行为要求见 `cluster-panel-scoped-tabs` 与 `admin-static-resources`。

