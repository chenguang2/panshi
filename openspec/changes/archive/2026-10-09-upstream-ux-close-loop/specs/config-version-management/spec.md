# config-version-management Delta

## ADDED Requirements

### Requirement: 版本回滚语义（恢复不自动发布）

版本管理弹窗（`VersionManagementModal`，全部资源类型共享）的回滚动作 SHALL 如实表达「仅恢复平台侧配置、不推送 Edge 节点」的真实语义（`rollback_resource` 无 EdgeClient 调用）；回滚成功后 SHALL 提供立即发布出口。所有使用该弹窗的资源类型 SHALL 一致生效。

#### Scenario: 恢复按钮文案
- **WHEN** 用户选中非当前版本
- **THEN** 按钮 SHALL 显示「恢复此版本配置（不会自动发布）」，SHALL NOT 显示「切换到此版本」

#### Scenario: 恢复前确认
- **WHEN** 用户点击「恢复此版本配置（不会自动发布）」
- **THEN** 系统 SHALL 经 `useOverlayModal` 弹出确认：「将把平台侧配置恢复到 vX，Edge 节点上的现有配置不受影响；如需下发请再执行发布」
- **AND** 系统 SHALL NOT 未经确认直接执行恢复

#### Scenario: 恢复成功提示与发布出口
- **WHEN** 恢复成功
- **THEN** 提示 SHALL 为「已恢复到 vX（平台侧）。请发布以推送到 Edge 节点」，SHALL NOT 出现暗示已在 Edge 生成的文案
- **AND** 弹窗 SHALL 提供「立即发布恢复的配置」出口：弹窗 `emit('publish-requested')`，由调用方接自家共享发布链路
- **AND** 该出口 SHALL 由 `canPublish` prop 控制显示（默认 false），MUST NOT 在未接线的资源域显示可点击按钮（避免「有按钮点了没反应」）
- **AND** 已接线调用点（本轮：上游全局页与集群子页）恢复后 SHALL 呈现「待发布」状态（见 `upstream-publish-status`）

### Requirement: 删除版本记录确认

删除非当前版本的历史版本记录 SHALL 有二次确认；版本历史是回滚的唯一锚点，删除属不可逆操作。

#### Scenario: 删除前确认
- **WHEN** 用户对非当前版本点击「删除此版本记录」
- **THEN** 系统 SHALL 经 `useOverlayModal` 确认：「删除后无法再回滚到 vX，确定删除？」
- **AND** 系统 SHALL NOT 未经确认直接调用删除 API

#### Scenario: 当前版本不可删
- **WHEN** 用户对当前版本点击删除
- **THEN** 系统 SHALL 维持既有拦截提示（「无法删除当前版本」），不弹出删除确认
