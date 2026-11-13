## MODIFIED Requirements

### Requirement: 保存后发布引导

保存上游（新建/编辑/复制保存）成功后，系统 SHALL 明确告知「配置尚未发布」，并提供立即发布的引导出口，MUST NOT 让用户误以为保存即已在 Edge 节点生效。全局表单与集群内表单 SHALL 保持一致。反馈 SHALL 为单通道：成功与「尚未发布」信息由引导弹窗一并承担。

#### Scenario: 保存成功提示语义
- **WHEN** 用户保存上游成功（任一表单入口）
- **THEN** 系统 SHALL NOT 弹出成功 toast（`message.success`）
- **AND** 保存成功与「配置尚未发布」语义 SHALL 由随后的引导弹窗承担（标题「保存成功」）
- **AND** 三处入口（全局表单/集群内联表单/复制保存）SHALL 一致（见 `save-feedback-single-channel`）
<!-- 2026-11-12 裁决（save-guide-single-feedback）：toast 恒在引导弹窗遮罩之下且 3 秒自动消失，
     信息与弹窗重复，改为单通道。禁止以「提升 toast z-index」满足此场景。 -->

#### Scenario: 保存后引导弹窗
- **WHEN** 用户保存成功
- **THEN** 系统 SHALL 经 `useOverlayModal` 弹出引导：「配置尚未发布，发布后才会推送到 Edge 节点生效。」
- **AND** 弹窗 SHALL 提供「稍后」与「立即发布」两个出口
- **AND** 「立即发布」SHALL 打开既有发布确认弹窗（`PublishConfirmModal`）并走共享发布链路
- **AND** 系统 SHALL NOT 未经用户确认自动发布

#### Scenario: 稍后路径不丢失状态
- **WHEN** 用户选择「稍后」
- **THEN** 该上游在列表 SHALL 呈现「待发布」状态（见 `upstream-publish-status`），发布动作保持可达
