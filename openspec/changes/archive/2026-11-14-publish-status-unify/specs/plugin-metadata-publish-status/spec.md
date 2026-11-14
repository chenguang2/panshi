## MODIFIED Requirements

### Requirement: 插件元数据部分失败状态

部分节点发布失败时 SHALL 显示「发布未完全生效」，且发布共享单点的能力探测自动写回（不新增列、不复制实现）。

#### Scenario: partial 状态展示与恢复
- **WHEN** 发布存在失败节点（`last_publish_status='partial'`）且无未下发修改
- **THEN** 状态显示「⚠ 发布未完全生效」（publish-status-unify 裁决：待发布优先于 partial 判定——编辑保存进入待发布态后 MUST NOT 继续显示「发布未完全生效」）
- **AND** 再次发布全部成功后 `last_publish_status` 清 NULL
- **AND** 回滚版本后 `last_publish_status` 清 NULL 且 `pending_publish=True`（引导重新发布）
