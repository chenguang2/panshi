# Database Running Tasks API

## Purpose

提供聚合接口查询当前数据库迁移锁状态与运行中的节点任务，为数据库管理页的"当前任务"卡片提供数据。

## Requirements

### Requirement: Running tasks aggregation API
系统 SHALL 提供 `GET /database/running-tasks` 端点，聚合返回数据库迁移锁状态（含源/目标/开始时间）与所有正在执行或排队中的节点任务列表（含集群名称）。该端点 SHALL 仅对拥有 `database_management` 权限的管理员开放。

#### Scenario: 无任务运行时返回空结果
- **WHEN** 管理员调用 `GET /database/running-tasks` 且当前无迁移也无运行/排队中的节点任务
- **THEN** 系统 SHALL 返回 `{"migration": null, "node_tasks": []}`

#### Scenario: 迁移进行中
- **WHEN** 管理员调用 `GET /database/running-tasks` 且当前正在执行数据库迁移
- **THEN** 系统 SHALL 返回 `migration` 对象，包含 `in_progress: true`、`source_id`、`target_id`、`started_at`

#### Scenario: 节点任务运行中
- **WHEN** 管理员调用 `GET /database/running-tasks` 且存在 status 为 running 或 pending 的节点任务
- **THEN** 系统 SHALL 在 `node_tasks` 数组中返回每个任务的 id、task_type、cluster_id、cluster_name、status、total_nodes、success_nodes、started_at

#### Scenario: 集群已删除
- **WHEN** 节点任务关联的 cluster_id 对应的集群已被删除
- **THEN** 系统 SHALL 返回 `cluster_name: null`，前端展示为"已删除"

#### Scenario: 未授权访问
- **WHEN** 未登录用户或无 `database_management` 权限的用户调用该端点
- **THEN** 系统 SHALL 拒绝请求并返回 401/403
