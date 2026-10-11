# Tasks: config-version-exitbar-completion

## 1. 前端接线（四入口出口条）

- [x] 1.1 `PluginConfigList.vue`：`can-publish` + `publish-requested` 接线；镜像 ref 取上下文；先关版本弹窗 → 既有 `PublishConfirmModal → executePublish` 链路；成功后刷新列表并重开版本弹窗（RED 先行：canPublish 断言 + 出口条交接断言）
- [x] 1.2 `GlobalRuleList.vue`：同款（发布标题复用既有 `publishTitle` computed）
- [x] 1.3 `ClusterPluginConfigs.vue`：`versionModalResource*` 镜像 ref 取上下文 → `publishByRecord` 既有链路（保留 M5 版本提示）→ 重开版本弹窗
- [x] 1.4 `ClusterGlobalRules.vue`：同款（2 参调用无 M5 提示行）
- [x] 1.5 组件测试 4 文件各 +2 用例（canPublish 断言 + 出口条 publish-requested → 发布链路上下文断言），RED 8 failed → GREEN 55/55

## 2. Tab 弹窗存活（恢复 / 发布后不被卸载）

- [x] 2.1 `ClusterPluginConfigs.onVersionPublished` 改 `loadPluginConfigs(props.cluster)` 面板局部刷新，不再 `emit('refresh')`（注释标明 activeTab 重置根因）
- [x] 2.2 `ClusterGlobalRules.onVersionPublished` 同款改 `loadGlobalRules(props.cluster)`

## 3. 当前版本恢复守卫

- [x] 3.1 `VersionManagementModal` 恢复按钮 `:disabled="selectedVersionData.version === currentVersion"` + title「当前版本无需恢复」（对齐同面板删除按钮既有守卫）

## 4. 验证

- [x] 4.1 `npx vue-tsc -b` 零错误；prettier / eslint 0 errors
- [x] 4.2 Tab 测试 25/25；全量 vitest 按 #196 协议串行复跑 8 失败文件 97/97 全绿（环境 flake 非回归）
- [x] 4.3 实页验收（Playwright UI 驱动）四入口 × 2 断言全 PASS：恢复 v1 → 出口条文案 → 立即发布 → 发布确认弹窗上下文正确；API 复核恢复后 `current_version=1`；当前版本恢复按钮禁用生效
