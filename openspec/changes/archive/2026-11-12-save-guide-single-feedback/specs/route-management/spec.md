## MODIFIED Requirements

### Requirement: 保存后发布引导

路由保存（新建 / 编辑 / 复制保存）成功后，系统 SHALL 明确告知「配置尚未发布」，并提供立即发布的引导出口，MUST NOT 让用户误以为保存即已在 Edge 节点生效。引导 SHALL 复用既有发布确认链路，SHALL NOT 引入第二套发布实现。反馈 SHALL 为单通道：成功与「尚未发布」信息由引导弹窗一并承担。

#### Scenario: 保存成功提示语义
- **WHEN** 用户在路由表单保存成功（新建 / 编辑 / 复制任一路径）
- **THEN** 系统 SHALL NOT 弹出成功 toast（`message.success`）
- **AND** 保存成功与「配置尚未发布」语义 SHALL 由随后的引导弹窗承担（标题「保存成功」）
- **AND** SHALL NOT 使用「路由已更新」「路由已创建」「路由已复制」等暗示已生效的措辞
- **AND** 三个保存入口 SHALL 一致（与 `upstream-management` 的同名需求对齐，见 `save-feedback-single-channel`）
<!-- 2026-11-12 裁决（save-guide-single-feedback）：toast 恒在引导弹窗遮罩（z-index 2000 > message 1010）之下且 3 秒自动消失，
     既不生效也与弹窗内容重复，故改为单通道。禁止改用「提升 toast z-index」的方式满足此场景。 -->

#### Scenario: 保存后引导弹窗
- **WHEN** 用户保存成功
- **THEN** 系统 SHALL 经 `useOverlayModal` 弹出引导：「配置尚未发布，发布后才会推送到 Edge 节点生效。」
- **AND** 弹窗 SHALL 提供「稍后」与「立即发布」两个出口
- **AND** 「立即发布」SHALL 打开既有发布确认弹窗（`PublishConfirmModal`）并走共享发布链路（该路由所属集群 + 该路由本身）
- **AND** 系统 SHALL NOT 未经用户确认自动发布

#### Scenario: 稍后路径不丢失状态
- **WHEN** 用户选择「稍后」
- **THEN** 列表 SHALL 刷新并在该行呈现「待发布」状态（后端 `pending_publish` 推导，前端不本地推导）
- **AND** 行内「发布」入口 SHALL 保持可达

#### Scenario: DNS 查询路由的引导不提供立即发布
- **WHEN** 被保存的路由是 DNS 查询路由（`plugin_name === 'dns_upstream'`）
- **THEN** 引导弹窗 SHALL NOT 提供「立即发布」出口（该域发布在「DNS 代理」页执行）
- **AND** 弹窗 SHALL 提示「DNS 路由请在『DNS 代理』页管理」
- **AND** 该路径 SHALL NOT 另弹成功 toast（同一单通道约束）
- **AND** 既有「DNS 路由整行禁用行内操作」语义 SHALL 保持不变
