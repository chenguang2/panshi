# Database Running Tasks UI

## Purpose

数据库管理页面展示当前阻塞写操作的运行任务信息，帮助管理员了解为何写请求被拒绝、迁移进展如何。

## Requirements

### Requirement: 当前任务卡片
数据库管理页面 SHALL 在"当前数据库"卡片和"连接列表"卡片之间展示"当前任务"卡片，实时反映阻塞写操作的运行任务。

#### Scenario: 无任务运行时显示空状态
- **WHEN** 管理员打开数据库管理页且当前无运行中的任务
- **THEN** 页面 SHALL 显示"当前任务"卡片，内容为 info 提示"当前没有正在执行的任务"

#### Scenario: 有任务运行时显示列表
- **WHEN** 管理员打开数据库管理页且存在运行或排队中的任务
- **THEN** 页面 SHALL 显示任务列表，每行包含任务类型（中文，前端映射）、集群名称、执行进度（已成功/总数）、开始时间

#### Scenario: 迁移锁激活时显示详情
- **WHEN** 数据库迁移正在进行（migration.in_progress = true）
- **THEN** 页面 SHALL 在卡片中显示警告提示"数据库迁移进行中，写操作已锁定"，并显示源→目标连接信息和开始时间

#### Scenario: 集群已删除
- **WHEN** 任务关联的集群已被删除（cluster_name 为 null）
- **THEN** 页面 SHALL 显示"已删除"作为集群名称

#### Scenario: 手动刷新
- **WHEN** 管理员点击"当前任务"卡片中的刷新按钮
- **THEN** 页面 SHALL 重新请求 `GET /database/running-tasks` 并更新展示
