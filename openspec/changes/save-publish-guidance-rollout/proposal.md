# Proposal

## Why

「保存后发布引导」（保存成功弹「立即发布 / 稍后」模态，替代被遮罩压住且自动消失的 toast）此前只覆盖路由与上游两域（route-save-publish-guidance + 上游既有实现）。同类「保存 ≠ 生效」的其余可发布资源（插件组 / 全局规则 / 插件元数据 / 4 层代理与 DNS 代理 / SSL 证书）保存后仍只有 toast 即时反馈，入口间口径不一致（2026-11-13 用户裁决：全部统一为引导弹窗，注意 toast 单通道问题）。

## What Changes

- **机制推广到 5 个资源域、8 个保存入口**（复用既有裁决，无新设计）：
  - 插件组：`PluginEntityFormModal`（独立页）+ 集群 Tab 内联表单（`useClusterPluginEntity`）
  - 全局规则：`PluginEntityFormModal`（独立页 + 集群 Tab，与插件组共享 modal）
  - 插件元数据：`PluginMetadata.vue` 卡片组件（独立页/统一管理面板共用，添加+编辑）+ `PluginMetadataList.vue`（添加+编辑）
  - 4 层代理 / DNS 代理：`StreamProxyFormWizard`（两页共用向导）
  - SSL 证书：`SslFormDrawer`（创建/编辑抽屉）
- **单通道**（save-feedback-single-channel 既有裁决的落地推广）：有引导弹窗的入口 MUST NOT 同时弹保存成功 toast；toast 仅保留在未接引导的入口（当前为空集）
- **语义钉住**：引导弹窗标题「保存成功」、正文「配置尚未发布，发布后才会推送到 Edge 节点生效。」、按钮「立即发布 / 稍后」；「立即发布」打开该资源**既有发布确认弹窗**（选节点），系统 MUST NOT 自动发布；先关表单再弹引导
- **不纳入**：静态资源（上传型无表单存盘流，其发布语义由五态分发徽章承担）；DNS 查询路由（Tab 内只读，沿 route-save-publish-guidance 既有指路分支）

## Capabilities

### New Capabilities

- `save-publish-guidance`：跨域保存后发布引导规则（入口清单、弹窗语义、立即发布链路、单通道约束）。

### Modified Capabilities

- `cluster-global-rules-component`：「表单收敛」场景中「统一保存 toast 随共享组件自动继承」更新为「保存反馈通道（toast 或发布引导）随共享组件自动继承」（批 2 起共享组件对该资源弹引导）。

## Impact

- 前端 5 组件 + 6 页面/容器接线；`withPublishGuide`（modal/drawer/wizard）与 `publishGuide`（composable）opt-in 开关；`publish-requested` 事件载荷含 `{clusterId, entityId, name, currentVersion?}`（对齐 RouteFormModal 载荷）。
- 实施提交：e338da9d（批 1 插件组）/ 890a0781（批 2 全局规则）/ 06feb3e2（批 3 插件元数据）/ 54022c7b（批 4 4层代理+DNS）/ b44e2ab5（批 5 SSL）；前端全量 2711/2711 绿、`vue-tsc -b` 通过。
