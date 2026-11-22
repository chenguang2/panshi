## REMOVED Requirements

### Requirement: ClusterGlobalRules component

**Reason**: 载体已删除（2026-11-22 面板 Tab = 独立页组件 scoped 单实现，见 `AGENTS.md #93`）。
**Migration**: 面板「全局规则」Tab 现直接渲染 `views/GlobalRuleList.vue`（`scopedClusterId`）；行为要求见 `cluster-panel-scoped-tabs`。

### Requirement: 集群子页表单统一共享实现

**Reason**: 载体已删除（2026-11-22 面板 Tab = 独立页组件 scoped 单实现，见 `AGENTS.md #93`）。
**Migration**: 表单为共享 `PluginEntityFormModal`；见 `cluster-panel-scoped-tabs`。

### Requirement: 集群子页加载失败与空态区分

**Reason**: 载体已删除（2026-11-22 面板 Tab = 独立页组件 scoped 单实现，见 `AGENTS.md #93`）。
**Migration**: 要求仍成立（载体为各独立页组件）；见 `cluster-panel-scoped-tabs` 同名需求。

### Requirement: 集群子页不渲染无效选中态

**Reason**: 载体已删除（2026-11-22 面板 Tab = 独立页组件 scoped 单实现，见 `AGENTS.md #93`）。
**Migration**: 要求仍成立（行选择/单选语义由各页自持）；见 `cluster-panel-scoped-tabs`。

