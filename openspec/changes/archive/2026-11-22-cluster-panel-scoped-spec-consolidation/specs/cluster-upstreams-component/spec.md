## Purpose

2026-11-12 裁决（save-guide-single-feedback）：单通道，理由见 `save-feedback-single-channel`。（原文注释随本规格退役，裁决见 `save-feedback-single-channel`。）


## REMOVED Requirements

### Requirement: ClusterUpstreams component

**Reason**: 载体已删除（2026-11-22 面板 Tab = 独立页组件 scoped 单实现，见 `AGENTS.md #93`）。
**Migration**: 面板「上游」Tab 现直接渲染 `views/UpstreamList.vue`（`scopedClusterId`）；行为要求见 `cluster-panel-scoped-tabs`。

### Requirement: 集群内上游表单交互

**Reason**: 载体已删除（2026-11-22 面板 Tab = 独立页组件 scoped 单实现，见 `AGENTS.md #93`）。
**Migration**: 表单已收敛为共享 `UpstreamFormModal`（批次 B1），面板与独立页同一实现；保存后发布引导/校验/误关保护见 `cluster-panel-scoped-tabs`。

