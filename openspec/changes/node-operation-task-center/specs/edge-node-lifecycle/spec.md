# edge-node-lifecycle — Delta Spec

## MODIFIED Requirements

### Requirement: Concurrency limit

节点生命周期操作（start/stop/reload/check/statistic）SHALL 受全局 ansible 并发信号量（`max_playbooks`）约束。任务化执行 SHALL 复用同一信号量，并额外保证**同一节点同一时刻只执行一个任务子项**（per-node 互斥）。

#### Scenario: 任务化操作受全局信号量约束
- **WHEN** 节点操作以任务形式执行
- **THEN** 每个节点子任务 SHALL 在获取 `max_playbooks` 信号量后才执行（与同步操作共享槽位）

#### Scenario: 同一节点任务互斥
- **WHEN** 同一节点存在运行中的任务子项
- **THEN** 后续涉及该节点的任务子项 SHALL 等待锁释放后再执行（per-node 互斥锁）
- **AND** 同一节点 SHALL NOT 同时执行两个任务子项

### Requirement: Execution result persistence

节点生命周期操作的执行结果 SHALL 持久化。现有 `node.status_detail`（同步单节点操作即时结果）SHALL 保留；任务化操作的执行结果 SHALL 写入任务表（主任务 + 节点子任务），两者数据共存、互不覆盖。

#### Scenario: 任务化结果写入任务表
- **WHEN** 节点操作以任务形式执行并完成
- **THEN** 该节点的 rc/stdout/stderr/command/日志 SHALL 持久化到任务子任务记录
- **AND** 同步单节点操作的 `node.status_detail` 行为 SHALL 不受影响（双轨并存）

## ADDED Requirements

### Requirement: 任务化生命周期操作

start/stop/reload/check/statistic 类节点生命周期操作 SHALL 支持以任务形式批量执行（task_type: start/stop/reload/check/statistic），由后端引擎并发调度，替代前端 runWithConcurrency 编排。

#### Scenario: 批量 start 任务化
- **WHEN** 用户创建 task_type=start 的多节点任务
- **THEN** 每个节点子任务 SHALL 调用 `nginx_cmd_run`（nginx_cmd=nginx_start，prefix/ports 逐节点取自节点记录）
- **AND** 后端引擎 SHALL 按信号量并发驱动，节点间互不阻塞

#### Scenario: 批量 statistic 任务化
- **WHEN** 用户创建 task_type=statistic 的多节点任务
- **THEN** 每个节点子任务 SHALL 调用 `edge_statistic` 采集状态
- **AND** 完成后前端任务中心 SHALL 可查看每节点采集结果
