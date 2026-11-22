## Purpose

2026-11-12 裁决（save-guide-single-feedback）：单通道，理由见 `save-feedback-single-channel`与独立页同名场景。（原文注释随本规格退役，裁决见 `save-feedback-single-channel`。）


## REMOVED Requirements

### Requirement: ClusterRoutes component

**Reason**: 载体已删除（2026-11-22 面板 Tab = 独立页组件 scoped 单实现，见 `AGENTS.md #93`）。
**Migration**: 面板「路由」Tab 现直接渲染 `views/RouteList.vue`（`scopedClusterId`）；行为要求见 `cluster-panel-scoped-tabs`。

### Requirement: 保存后发布引导

**Reason**: 载体已删除（2026-11-22 面板 Tab = 独立页组件 scoped 单实现，见 `AGENTS.md #93`）。
**Migration**: 由共享 `RouteFormModal` 承接（批次 B1），面板与独立页同一实现；见 `cluster-panel-scoped-tabs`。

