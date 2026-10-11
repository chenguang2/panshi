# Proposal: config-version-exitbar-completion

## Why

版本恢复出口条（`canPublish` + `publish-requested`）自 upstream-ux-close-loop 起为调用方 opt-in 接线。用户实测发现**插件组与全局规则的四个入口**（独立页 + 统一管理 Tab）恢复配置后没有「立即发布恢复的配置」出口——恢复平台侧成功但 Edge 未生效，用户无重新发布引导。实页验收又暴露两个连带缺陷：

1. **Tab 入口恢复后版本弹窗整个消失**：VMM 恢复成功 `emit('published')` → Tab 转发 `emit('refresh')` → CentralList `loadClusters` 重建 cluster 对象并硬编码 `activeTab: 'nodes'` → 用户被踢回节点 Tab、版本弹窗随面板卸载，出口条根本看不到。
2. **「当前版本」恢复按钮无守卫**：点击是 no-op（`rollback_resource` 对 current_version 同值不产生变更）却提示「已恢复成功」，与决策 2a（UI 只允许回滚非当前版本）的既定口径不符。

## What Changes

- 插件组 / 全局规则四入口接线恢复出口条：独立页 `PluginConfigList` / `GlobalRuleList` 复用自持 `PublishConfirmModal → executePublish` 链路；Tab `ClusterPluginConfigs` / `ClusterGlobalRules` 经 composable 既有 `publishByRecord` 链路；发布后重开版本弹窗。
- Tab `onVersionPublished` 改面板局部刷新（`loadPluginConfigs` / `loadGlobalRules` 原地更新 cluster 对象），不再 `emit('refresh')` 触发父级全量刷新——版本弹窗在恢复 / 发布后保持存活。
- VMM 恢复按钮对当前版本禁用（`:disabled` + title「当前版本无需恢复」），对齐同面板删除按钮既有模式。

## Impact

- **Affected specs**: `config-version-management`
- **Affected code**: `frontend/src/components/VersionManagementModal.vue`（恢复守卫）、`frontend/src/views/PluginConfigList.vue`、`frontend/src/views/GlobalRuleList.vue`、`frontend/src/views/clusters/ClusterPluginConfigs.vue`、`frontend/src/views/clusters/ClusterGlobalRules.vue`（接线 + 面板局部刷新）+ 4 个组件测试文件。后端零改动。
