# cluster-json-backup Delta

## ADDED Requirements

### Requirement: 导入完成后的前端闭环

备份导入成功后，前端 SHALL 打通「结果感知 → 列表刷新 → 前往新集群」最后一公里。

#### Scenario: 导入成功后列表刷新与去向引导
- **WHEN** 导入成功完成
- **THEN** 结果区 SHALL 提供按钮「前往新集群」，携带新 `cluster_id` 跳转统一管理页深链（复用既有 `editClusterId` query）
- **AND** 关闭弹窗时父页面 SHALL 刷新集群列表（监听 `imported` 事件），使新集群即时可见，MUST NOT 需要用户手动刷新
