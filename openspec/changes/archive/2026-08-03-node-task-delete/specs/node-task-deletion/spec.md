# node-task-deletion Specification

## Purpose

节点任务的硬删除能力：支持单个与批量删除任务记录，删除时级联清理子任务记录与日志文件，仅终态任务可删除（执行中任务需先取消）。

## ADDED Requirements

### Requirement: 单个任务删除

系统 SHALL 提供单个任务的硬删除：删除任务时级联删除其子任务记录并清理对应日志文件。

#### Scenario: 删除终态任务
- **WHEN** 用户 DELETE `/node-tasks/{task_id}`，且该任务状态为 success/failed/partial/cancelled
- **THEN** 系统 SHALL 删除该任务及其全部子任务记录（FK CASCADE）
- **AND** 系统 SHALL 清理 `task-logs/{task_id}/` 日志文件目录
- **AND** 返回 200 与 `{"deleted": [task_id]}`

#### Scenario: 任务不存在
- **WHEN** 用户 DELETE `/node-tasks/{task_id}`，且任务不存在
- **THEN** 系统 SHALL 返回 404

#### Scenario: 执行中任务不可删除
- **WHEN** 用户 DELETE `/node-tasks/{task_id}`，且任务状态为 running/pending
- **THEN** 系统 SHALL 返回 409，detail 提示"任务执行中，请先取消"

### Requirement: 批量删除任务

系统 SHALL 提供批量删除：一次删除多个终态任务，非终态或不存在任务被跳过并报告。

#### Scenario: 批量删除终态任务
- **WHEN** 用户 POST `/node-tasks/batch-delete`，body 含 `task_ids`
- **THEN** 系统 SHALL 删除所有终态任务（含子任务记录与日志文件）
- **AND** 返回 `{"deleted": [ids], "skipped": [ids]}`，skipped 为执行中或不存在任务

#### Scenario: 全部任务执行中
- **WHEN** 批量删除请求中所有任务均为 running/pending
- **THEN** 系统 SHALL 返回 409 或 `{"deleted": [], "skipped": [ids]}`，不删除任何任务
