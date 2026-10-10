# cluster-delete-stats Delta

## MODIFIED Requirements

### Requirement: Frontend shows resource stats before deletion

The system SHALL display a confirmation dialog listing all resource counts and require the user to type the cluster name before enabling the delete button. 集群删除编排 SHALL 由两页（集群管理/统一管理）共享单实现（`deleteClusterWithConfirm`），接口失败 MUST NOT 降级删除语义。

#### Scenario: Stats displayed in confirm dialog
- **WHEN** the user clicks "删除" on a cluster
- **THEN** a modal SHALL display counts of nodes, upstreams, routes, plugin_configs, global_rules, plugin_metadata, config_versions, and static resources（中文标签「静态资源」，SHALL NOT 显示英文 key）
- **AND** 弹窗 SHALL 在 scope 区上方显示集群专属警示（黄底）：「删除集群将同时移除平台内该集群的全部资源记录与版本历史」

#### Scenario: 集群专属 scope 风险提示
- **WHEN** 用户未勾选「从 Edge 节点中删除」
- **THEN** 风险提示 SHALL 显示集群专属文案：「仅删除平台记录：该集群及全部资源记录从平台移除，Edge 节点将继续按现有配置运行，但脱离平台管理（无法再发布与监控）」
- **AND** 集群场景 MUST NOT 使用通用「该资源」兜底文案

#### Scenario: 统计加载失败不降级删除
- **WHEN** 删除前拉取节点或资源统计接口失败
- **THEN** 确认弹窗 SHALL 照常弹出，清单区显示「资源统计加载失败，不影响删除」
- **AND** 节点明细不可用时节点选择区 SHALL 显示「节点明细不可用，Edge 删除将由后端遍历全部活跃节点」，`nodeIds` 传空数组（后端 `DELETE /clusters/{id}` 全量遍历语义不变，仅进度日志粒度降级）
- **AND** 确认后 SHALL 照常执行删除，MUST NOT 出现「确认后仅刷新列表不删除」的假成功
- **AND** 两页（集群管理/统一管理）SHALL 走同一共享编排实现

#### Scenario: Name confirmation required
- **WHEN** the user attempts to confirm deletion
- **THEN** the confirm button SHALL be disabled until the user types the exact cluster name into an input field

#### Scenario: Progress dialog shows deletion status
- **WHEN** the user confirms deletion
- **THEN** a progress dialog SHALL show the deletion progress with real-time logs (reusing `buildDeleteProgressContent`)
