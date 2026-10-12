# config-version-management Delta

## MODIFIED Requirements

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
- **AND** 已接线调用点（上游独立页与集群子页、插件元数据独立页与统一管理 Tab、插件组独立页与集群子页 Tab、全局规则独立页与集群子页 Tab、**路由独立页与集群子页 Tab**）恢复后 SHALL 呈现「待发布」状态
- **AND** 已接线入口点击「立即发布恢复的配置」SHALL 以恢复弹窗的上下文资源打开各自既有发布链路（独立页 `PublishConfirmModal → executePublish`；Tab 经 composable 既有 `publishByRecord`），发布成功后 SHALL 重开版本弹窗（重载版本列表并复位出口条）

#### Scenario: 当前版本恢复入口禁用
- **WHEN** 用户在版本详情面板选中的是当前版本
- **THEN** 恢复按钮 SHALL 禁用并提示「当前版本无需恢复」（与同面板删除按钮的当前版本守卫同构）
- **AND** 系统 SHALL NOT 对当前版本呈现可点击的恢复入口（API 层 no-op 回滚语义不变，见已知边界）

## ADDED Requirements

### Requirement: 版本列表展示操作人

版本管理弹窗的版本列表 SHALL 展示每条版本记录的发布操作人（接口字段 `created_by`），便于回滚场景的审计感知。

#### Scenario: 版本 meta 行显示操作人
- **WHEN** 版本记录包含 `created_by`
- **THEN** 版本 meta 行 SHALL 显示「由 {created_by} 发布」（与发布时间同组展示）

#### Scenario: 操作人缺失时静默降级
- **WHEN** 版本记录的 `created_by` 为空（历史数据）
- **THEN** meta 行 SHALL 只显示发布时间，SHALL NOT 显示「由 发布」残缺文案
