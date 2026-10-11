# config-version-management 变更（delta）

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
- **AND** 已接线调用点（上游独立页与集群子页、插件元数据独立页与统一管理 Tab、插件组独立页与集群子页 Tab、全局规则独立页与集群子页 Tab）恢复后 SHALL 呈现「待发布」状态
- **AND** 已接线入口点击「立即发布恢复的配置」SHALL 以恢复弹窗的上下文资源打开各自既有发布链路（独立页 `PublishConfirmModal → executePublish`；Tab 经 composable 既有 `publishByRecord`），发布成功后 SHALL 重开版本弹窗（重载版本列表并复位出口条）

#### Scenario: 当前版本恢复入口禁用

- **WHEN** 用户在版本详情面板选中的是当前版本
- **THEN** 恢复按钮 SHALL 禁用并提示「当前版本无需恢复」（与同面板删除按钮的当前版本守卫同构）
- **AND** 系统 SHALL NOT 对当前版本呈现可点击的恢复入口（API 层 no-op 回滚语义不变，见已知边界）

## ADDED Requirements

### Requirement: Tab 入口版本弹窗存活

统一管理集群面板（Tab 形态）中打开的版本管理弹窗 SHALL 在恢复 / 版本发布后的数据刷新中保持存活：Tab 收到弹窗 `published` 事件后 SHALL 做面板局部刷新（composable 加载函数原地更新 cluster 对象），MUST NOT 转发父级全量刷新（CentralList `loadClusters` 重建 cluster 对象会把 `activeTab` 重置为 `'nodes'`，导致面板组件连同版本弹窗被卸载、用户被踢出当前 Tab）。

#### Scenario: 恢复后出口条存活可点击

- **WHEN** 用户在 Tab 入口的版本管理弹窗中恢复历史版本成功
- **THEN** 版本弹窗 SHALL 保持打开且「立即发布恢复的配置」出口条可见可点击
- **AND** 用户 SHALL NOT 被踢回「集群节点」Tab

#### Scenario: 发布后版本弹窗重开

- **WHEN** 用户经出口条「立即发布恢复的配置」完成发布（或取消发布）
- **THEN** Tab SHALL 返回并重开版本弹窗（版本列表经 open watch 重载、出口条复位）；恢复结果已落库 MUST NOT 丢失
- **AND** Tab 的四态发布状态 SHALL 随面板局部刷新即时更新
