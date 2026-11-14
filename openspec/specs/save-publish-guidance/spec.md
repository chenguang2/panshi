# save-publish-guidance Specification

## Purpose
TBD - created by archiving change save-publish-guidance-rollout. Update Purpose after archive.

## Requirements

### Requirement: 保存后发布引导跨域统一

凡「保存 ≠ 生效」的表单型可发布资源（路由、上游、插件组、全局规则、插件元数据、4 层代理、DNS 代理、SSL 证书），保存成功后 SHALL 弹出发布引导模态弹窗（先关表单再弹，`useOverlayModal` 挂 body），替代保存成功 toast；入口清单的扩充与收缩 SHALL 经 openspec 变更裁决，MUST NOT 逐入口私自增减。

#### Scenario: 引导弹窗语义
- **WHEN** 任一接入入口保存成功（创建或编辑）
- **THEN** 系统 SHALL 先关闭表单，再弹出标题「保存成功」、正文「配置尚未发布，发布后才会推送到 Edge 节点生效。」的引导弹窗，按钮为「立即发布 / 稍后」
- **AND** 系统 MUST NOT 同时弹出保存成功 toast（save-feedback-single-channel 单通道约束：toast 恒在弹窗遮罩之下且自动消失，属重复失效通道）

#### Scenario: 立即发布复用既有链路
- **WHEN** 用户在引导弹窗点「立即发布」
- **THEN** 系统 SHALL 打开该资源的既有发布确认弹窗（选节点），MUST NOT 自动发布
- **AND** 发布确认弹窗 SHALL 与行内发布按钮同链路（同一 `executePublish` / 进度弹窗实现）

#### Scenario: 稍后与未接入入口
- **WHEN** 用户点「稍后」（或关闭引导弹窗）
- **THEN** 系统 SHALL 关闭引导，不触发发布；列表「待发布」标签 SHALL 继续作为持久信号
- **AND** 未接入引导的保存入口（如域内只读指路分支）SHALL 保留 toast 作为唯一即时反馈（沿 save-feedback-single-channel 既有场景）

### Requirement: 接入入口清单

下列入口 SHALL 接入保存后发布引导：插件组独立页与集群 Tab、全局规则独立页与集群 Tab、插件元数据卡片组件（独立页/统一管理面板共用）与独立页（添加+编辑）、4 层代理与 DNS 代理共享向导、SSL 证书创建/编辑抽屉。静态资源（上传型，五态分发徽章已是其发布语义）与 DNS 查询路由（Tab 内只读，沿指路分支）SHALL NOT 接入。

#### Scenario: 共享组件参数化接入
- **WHEN** 共享表单组件（`PluginEntityFormModal` / `StreamProxyFormWizard` / `SslFormDrawer`）或共享 composable（`useClusterPluginEntity`）服务多资源域
- **THEN** 引导 SHALL 以 opt-in 开关参数化（`withPublishGuide` / `publishGuide`），未开启的域 MUST NOT 改变既有 toast 行为
- **AND** 「立即发布」事件载荷 SHALL 携带 `{clusterId, entityId, name, currentVersion?}`（编辑态带版本号供发布弹窗提示「将创建 v(N+1)」，对齐 RouteFormModal 载荷）
