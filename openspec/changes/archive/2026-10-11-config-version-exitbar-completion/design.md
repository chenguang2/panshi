# Design: config-version-exitbar-completion

## Context

版本管理弹窗（`VersionManagementModal`）的出口条由 `canPublish` prop 控制（默认 false）、经 `emit('publish-requested')` 交由调用方接自家发布链路——组件内不能替调用方发发布请求（各资源发布 API / 参数不同）。本轮前已接线：上游两入口（7cef5df8）、插件元数据两入口（59d8c9f9）。插件组与全局规则四入口的历史改造批次（a053a41e / cd8b3e48）未含此接线。

实页验收（Playwright 真实 UI 驱动）暴露两个接线面之外的行为缺陷（详见 proposal）。

## Decisions

### D1 接线模式：镜像既有插件元数据范式

- 独立页（`PluginConfigList` / `GlobalRuleList`）：镜像 ref 记录版本弹窗上下文资源 → `publish-requested` 时先关版本弹窗 → 复用页面既有 `PublishConfirmModal → executePublish` 链路 → 成功后刷新列表并重开版本弹窗（重开触发组件既有 open watch 重载版本列表并复位出口条）。
- Tab（`ClusterPluginConfigs` / `ClusterGlobalRules`）：从 composable 写入的 `versionModalResource*` 镜像 ref 取上下文 → 按 id 从 `props.cluster` 找回完整记录（保留 M5 `currentVersion` 版本提示）→ `publishByRecord` 既有链路（内置确认 / executePublish / 列表刷新）→ 重开版本弹窗。链路为 promise 单出口（取消与成功同样 resolve），取消时也回到版本弹窗（恢复已落库不丢失，代码注释双处标明）。

### D2 Tab 弹窗存活：面板局部刷新，不走父级 refresh

根因链：VMM 恢复成功 `emit('published')`（组件内 restoredVersion 置位点，:627/:658）→ Tab `onVersionPublished` 原 `emit('refresh')` → CentralList `loadClusters()` 重建 cluster 对象时硬编码 `activeTab: 'nodes'` → Tab 面板 `v-else-if` 卸载整个 `ClusterPluginConfigs` 组件（版本弹窗在其子树内随之销毁）。

修法：`onVersionPublished` 改调 `loadPluginConfigs(props.cluster)` / `loadGlobalRules(props.cluster)`（composable 既有函数，原地更新 cluster 对象）。恢复 / 发布不改变集群统计计数，父级徽章无漂移；四态状态徽章数据由面板局部刷新即时保鲜。独立页未接 `@published`，无此问题。

### D3 当前版本恢复守卫：照抄同面板删除按钮既有模式

`rollback_resource` 对「回滚到当前版本」是 no-op（不产生脏属性 → 不触发 UPDATE，响应仍报成功）——决策 2a 已接受该 API 语义，但当时认定「UI 只允许回滚非当前版本」与代码不符：恢复按钮对当前版本行同样渲染。修法：恢复按钮加 `:disabled="selectedVersionData.version === currentVersion"` + title「当前版本无需恢复」，与同面板删除按钮的既有守卫（:95）完全同构。

## Verified Facts

- VMM 出口条机制完整（`canPublish` → 出口条 → `emit('publish-requested')`，注释明示「调用方接自家发布链路」），组件本轮仅加恢复守卫一处。
- 四入口既有发布链路均可用：独立页自持 `PublishConfirmModal + executePublish`；Tab 经 `useClusterPluginEntity → useClusterResourceCore` 的 `publishByRecord`。
- 实页验收（Playwright，UI 驱动）四入口 × 2 断言全 PASS：恢复 v1 → 出口条 → 立即发布 → 发布确认弹窗上下文正确；API 复核恢复后 `current_version=1`。

## Known Limitations

- Tab 发布链路取消发布时同样重开版本弹窗（promise 单出口无法区分取消 / 成功，已注释标明；恢复状态不丢失）。
- 零活跃节点发布、发布后新增节点不回填等发布状态边界沿用 `plugin-metadata-publish-status` 既定口径，本轮不变。
