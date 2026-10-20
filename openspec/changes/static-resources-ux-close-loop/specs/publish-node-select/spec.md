# publish-node-select Delta

## MODIFIED Requirements

### Requirement: Publish confirm dialog SHALL support select all / deselect all

The dialog SHALL provide "全选" and "取消全选" links. "全选" SHALL only select online nodes. "取消全选" SHALL clear all selections. A live counter SHALL show「已选择 {N} 个在线节点」，集群存在离线节点时附「（{M} 个离线不可选）」。

#### Scenario: Select all online nodes
- **WHEN** the user clicks "全选"
- **THEN** all online nodes SHALL be checked
- **THEN** offline nodes SHALL remain unchecked and disabled
- **THEN** the counter SHALL update to「已选择 {online_count} 个在线节点」；存在离线节点时 SHALL 显示「（{offline_count} 个离线不可选）」

#### Scenario: Deselect all
- **WHEN** the user clicks "取消全选"
- **THEN** all checkboxes SHALL be cleared
- **THEN** the counter SHALL show「已选择 0 个在线节点」（存在离线节点时附离线数说明）

#### Scenario: 分母不再计入离线节点
- **WHEN** 集群含离线节点且弹窗打开
- **THEN** 计数 SHALL NOT 以含离线的总节点数作分母（SHALL NOT 显示「X / 含离线总数」形态）
- **AND** 该计数形态为共享弹窗单点实现，全部资源域一致生效

## ADDED Requirements

### Requirement: Publish confirm dialog SHALL support resource context summary

The publish confirm dialog SHALL accept an optional resource summary line and an optional overwrite warning. 未传参的资源域 SHALL NOT 渲染这两个区域（向后兼容）。

#### Scenario: 静态资源发布显示摘要与覆盖预警
- **WHEN** 静态资源任一入口打开发布确认弹窗
- **THEN** 弹窗顶部 SHALL 显示资源摘要「将把「{name}」v{N}（{size}，{url_path}）分发到所选节点」
- **AND** 确认按钮上方 SHALL 显示 danger 覆盖预警「发布将覆盖所选节点上的现有静态资源文件」
- **AND** SHALL NOT 复用「本次发布将创建新版本 vN+1」版本提示行（静态资源发布不产生新版本，版本在上传时递增）

#### Scenario: 其它资源域不受影响
- **WHEN** 未传 `resourceSummary`/`overwriteWarning` 的资源域打开发布确认弹窗
- **THEN** 摘要与预警区域 SHALL NOT 渲染，既有布局与文案 SHALL 不变
