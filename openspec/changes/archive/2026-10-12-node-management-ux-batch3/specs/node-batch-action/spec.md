# node-batch-action Delta

## ADDED Requirements

### Requirement: 独立页批量操作

节点管理独立页（跨集群列表）SHALL 提供批量操作能力：行选择后可对选中节点批量执行启动、停止、reload、状态查询，与 Tab 共用同一批量执行核心与进度弹窗。**执行路径分两类**：动作类（启动/停止/reload）的批量端点为 per-cluster（`POST /clusters/{id}/nodes/action`），SHALL 按选中行的 `cluster_id` 分组、逐集群调用；批量状态查询不走批量端点，SHALL 逐节点执行（与 Tab `batchNodeStatus` 同款）。

#### Scenario: 动作类批量分组执行
- **WHEN** 用户勾选分属多个集群的节点并点击批量启动/停止/reload
- **THEN** 系统 SHALL 按 `cluster_id` 分组、逐集群调用该集群的批量端点
- **AND** 所有集群的节点 SHALL 合并展示在同一批量进度弹窗中

#### Scenario: 批量状态查询逐节点执行
- **WHEN** 用户勾选节点并点击批量状态查询
- **THEN** 系统 SHALL 逐节点发起状态查询（SSE 流式），不经过集群分组端点调用

#### Scenario: 批量前确认
- **WHEN** 用户点击任一批量动作（启动/停止/reload/状态查询）
- **THEN** SHALL 先弹出危险色确认弹窗（全动作统一危险红，确认后才执行）

#### Scenario: 集群级调用失败不中断
- **WHEN** 逐集群顺序执行中某集群的批量端点调用失败（HTTP 5xx/网络断）
- **THEN** 系统 SHALL 不中断整体，继续执行后续集群
- **AND** 该集群 SHALL 在汇总中记「集群级失败（原因）」，其节点项标失败态

#### Scenario: 完成后按集群汇总
- **WHEN** 分组执行全部结束
- **THEN** 系统 SHALL 按集群汇总结果（如「集群 A：2 成功 1 失败；集群 B：3 成功」）
- **AND** 失败节点的明细 SHALL 可在进度弹窗日志中查看
