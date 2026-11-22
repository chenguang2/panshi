## REMOVED Requirements

### Requirement: ClusterPluginConfigs component

**Reason**: 载体已删除（2026-11-22 面板 Tab = 独立页组件 scoped 单实现，见 `AGENTS.md #93`）。
**Migration**: 面板「插件组」Tab 现直接渲染 `views/PluginConfigList.vue`（`scopedClusterId`）；行为要求见 `cluster-panel-scoped-tabs`。

### Requirement: 表单跨 Tab 校验反馈

**Reason**: 载体已删除（2026-11-22 面板 Tab = 独立页组件 scoped 单实现，见 `AGENTS.md #93`）。
**Migration**: 表单为共享 `PluginEntityFormModal`，校验反馈由组件内承接；见 `cluster-panel-scoped-tabs`。

### Requirement: 表单误关保护

**Reason**: 载体已删除（2026-11-22 面板 Tab = 独立页组件 scoped 单实现，见 `AGENTS.md #93`）。
**Migration**: 由共享表单组件承接；见 `cluster-panel-scoped-tabs`。

### Requirement: 列表筛选与空态文案

**Reason**: 载体已删除（2026-11-22 面板 Tab = 独立页组件 scoped 单实现，见 `AGENTS.md #93`）。
**Migration**: 要求仍成立（独立页 `PluginConfigList` 自持筛选与空态）；见 `cluster-panel-scoped-tabs`。

### Requirement: 路由关联卡片状态语义

**Reason**: 载体已删除（2026-11-22 面板 Tab = 独立页组件 scoped 单实现，见 `AGENTS.md #93`）。
**Migration**: 要求仍成立（卡片「引用 · N 条路由」由后端 `reference_count` 提供）；见 `cluster-panel-scoped-tabs`。

### Requirement: 插件组集群子页加载失败与空态区分

**Reason**: 载体已删除（2026-11-22 面板 Tab = 独立页组件 scoped 单实现，见 `AGENTS.md #93`）。
**Migration**: 并入 `cluster-panel-scoped-tabs` 的「加载失败与空态区分」。

