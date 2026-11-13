## MODIFIED Requirements

### Requirement: 保存后发布引导

集群路由 Tab 保存（新建 / 编辑）成功后，系统 SHALL 明确告知「配置尚未发布」，并提供立即发布的引导出口，MUST NOT 让用户误以为保存即已在 Edge 节点生效。语义 SHALL 与独立页（`route-management`）一致，发布 SHALL 复用本 Tab 既有的集群内发布链路。反馈 SHALL 为单通道：成功与「尚未发布」信息由引导弹窗一并承担。

#### Scenario: 保存成功提示语义
- **WHEN** 用户在集群路由 Tab 保存路由成功（新建或编辑）
- **THEN** 系统 SHALL NOT 弹出成功 toast（`message.success`）
- **AND** 保存成功与「配置尚未发布」语义 SHALL 由随后的引导弹窗承担（标题「保存成功」）
- **AND** SHALL NOT 使用「路由已更新」「路由已添加」等暗示已生效的措辞
- **AND** 保存后 SHALL 刷新该集群的路由列表，使「待发布」标签立即可见
<!-- 2026-11-12 裁决（save-guide-single-feedback）：单通道，理由见 `save-feedback-single-channel` 与独立页同名场景。 -->

#### Scenario: 保存后引导弹窗
- **WHEN** 用户保存成功
- **THEN** 系统 SHALL 经 `useOverlayModal` 弹出引导：「配置尚未发布，发布后才会推送到 Edge 节点生效。」
- **AND** 弹窗 SHALL 提供「稍后」与「立即发布」两个出口
- **AND** 「立即发布」SHALL 走集群内既有发布链路（发布确认弹窗 → 共享发布执行），发布对象为该集群的该路由
- **AND** 系统 SHALL NOT 未经用户确认自动发布

#### Scenario: DNS 查询路由的引导不提供立即发布
- **WHEN** 被保存的路由是 DNS 查询路由（`plugin_name === 'dns_upstream'`）
- **THEN** 引导弹窗 SHALL NOT 提供「立即发布」出口
- **AND** 弹窗 SHALL 提示「DNS 路由请在『DNS 代理』页管理」
- **AND** 该路径 SHALL NOT 另弹成功 toast（同一单通道约束）
- **AND** 既有「DNS 路由在 Tab 内只读（操作按钮禁用 + tooltip）」语义 SHALL 保持不变
