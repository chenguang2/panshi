# node-batch-action — Delta Spec

## MODIFIED Requirements

### Requirement: Batch node action (start/stop/reload)

The system SHALL allow admins to batch-execute start/stop/reload operations on multiple nodes within a single cluster from the cluster detail page's nodes tab.

#### Scenario: Batch action button with selection
- **WHEN** admin checks more than one node in the nodes table of a cluster detail page
- **THEN** the toolbar action buttons (启动/停止/reload) SHALL show with a count suffix (e.g. "启动(2)")
- **AND** clicking an action button SHALL trigger the batch operation on all checked nodes

#### Scenario: Batch action confirmation lists node IPs
- **WHEN** admin triggers a batch action with N nodes checked
- **THEN** a confirmation dialog SHALL list the selected node IPs (≤3 full, >3 truncated with "等 N 条")
- **AND** the batch request SHALL NOT be sent until confirmed

#### Scenario: Batch action executes on all selected nodes
- **WHEN** admin confirms a batch start/stop/reload
- **THEN** the system SHALL execute the action on each node with a concurrency limit (defaulting to 5, configurable via the deployment `features.yaml` `concurrency.batch_action` value, matching the backend ansible semaphore) by calling the per-node endpoint (`POST /clusters/{cluster_id}/nodes/{node_id}/{action}`)
- **THEN** a progress modal SHALL show each node's IP with live status (等待中/执行中/成功/失败)
- **AND** clicking a node row SHALL expand its command, rc, stdout, and stderr logs

#### Scenario: Batch action results shown per node
- **WHEN** the batch action completes
- **THEN** each node row SHALL show its final success/failure status
- **AND** failure of one node SHALL NOT block the remaining nodes

#### Scenario: Selection cleared after batch action
- **WHEN** a batch action is initiated (before the request is sent)
- **THEN** the checked selection (selectedNodeKeys) SHALL be cleared
- **THEN** the single selection (selectedNode) SHALL be cleared
- **THEN** the node list SHALL be refreshed on completion

### Requirement: Batch node status query

The system SHALL allow admins to query the status of multiple nodes at once, showing a progress modal during execution and a results table after completion.

#### Scenario: Batch status query shows progress then results table
- **WHEN** admin triggers a batch status query with multiple nodes checked
- **THEN** a progress modal SHALL show each node's IP with live status (等待中/执行中/成功/失败), executed with a concurrency limit (defaulting to 5, configurable via the deployment `features.yaml` `concurrency.batch_action` value)
- **THEN** after completion the progress modal SHALL close and a results table SHALL list each node with IP, Edge version, health status, and failure reason columns
- **AND** clicking a row's 详情 button SHALL expand that node's full process details (command, stdout, stderr)
- **AND** health status SHALL be derived from the node's status (1=健康, 0=离线), not from the statistic response
- **AND** the failure reason column SHALL show a concise error summary (key error/failed lines) when a node's rc is non-zero

#### Scenario: Batch status query execution
- **WHEN** admin confirms a batch status query
- **THEN** the system SHALL query each node's status by calling the per-node statistic endpoint (`POST /clusters/{cluster_id}/nodes/{node_id}/statistic`), with a concurrency limit (defaulting to 5, configurable via the deployment `features.yaml` `concurrency.batch_action` value)
- **THEN** the node list SHALL be refreshed after completion (to reflect updated Edge versions)

## ADDED Requirements

### Requirement: 并发上限由部署配置驱动

前端批量节点操作（start/stop/reload/status）的并发数 SHALL 由部署配置 `features.yaml` 的 `concurrency.batch_action` 决定，而非硬编码常量。后端全局 ansible playbook 并发上限 SHALL 由 `concurrency.max_playbooks` 决定（通过 `AnsibleRunnerService` 的信号量生效）。

#### Scenario: 配置了 batch_action 时按配置执行
- **WHEN** `features.yaml` 包含 `concurrency: { batch_action: 10 }`
- **AND** 前端已加载 features 配置
- **THEN** `batchNodeAction` / `batchNodeStatus` SHALL 以并发上限 10 执行批量操作

#### Scenario: 未配置时使用默认值 5
- **WHEN** `features.yaml` 不包含 `concurrency.batch_action`
- **THEN** 前端批量操作 SHALL 以默认并发上限 5 执行（与历史行为一致）

#### Scenario: 前端并发受后端上限约束（clamp）
- **WHEN** `features.yaml` 包含 `concurrency: { batch_action: 10, max_playbooks: 5 }`
- **THEN** 前端批量操作的**实际并发上限 SHALL 为 min(10, 5) = 5**（`batch_action` 对 `max_playbooks` 做 clamp）
- **AND** 目的 SHALL 是防止前端并发请求超过后端信号量上限后，在服务端排队超过前端 axios 30s timeout 导致超时假失败

#### Scenario: 后端信号量跟随 max_playbooks
- **WHEN** `features.yaml` 包含 `concurrency: { max_playbooks: 8 }`
- **THEN** `AnsibleRunnerService` 的并发信号量 SHALL 以 8 为上限创建
- **AND** 同一进程内同时执行的 ansible playbook 数 SHALL NOT 超过 8

#### Scenario: 后端默认信号量
- **WHEN** `features.yaml` 不包含 `concurrency.max_playbooks`
- **THEN** `AnsibleRunnerService` 的并发信号量 SHALL 以默认值 5 为上限创建
