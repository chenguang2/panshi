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

### Requirement: 全局迁移锁横幅
迁移锁进行期间，系统 SHALL 在应用层提供全局横幅，使任意页面的用户理解写操作为何被拒绝、何时恢复，而非依赖各页面局部报错。横幅 SHALL 由写请求 503 锁响应事件驱动拉起（辅以 `GET /database/running-tasks` 填充进度），MUST NOT 引入常驻轮询。迁移锁 503 响应文案 SHALL 出口化：包含迁移源 → 目标标识、「写操作将在迁移完成后自动恢复」与「进度见数据迁移页」指引。迁移锁开始时间 SHALL 按 naive UTC 约定存储（修正 `datetime.now()` 本地时间缺陷），前端经统一时间解析按 Asia/Shanghai 展示。

#### Scenario: 迁移锁激活时展示全局横幅
- **WHEN** 迁移进行中且用户在任意页面发起写操作收到 503 锁响应
- **THEN** 应用层 SHALL 拉起全局横幅，展示迁移源 → 目标与写锁说明，并提供进入数据迁移页查看进度的入口

#### Scenario: 锁解除后横幅移除
- **WHEN** 迁移锁解除后用户再次发起写操作成功（或刷新页面时 running-tasks 无进行中迁移）
- **THEN** 全局横幅 SHALL 移除

#### Scenario: 503 锁文案出口化
- **WHEN** 任意写请求被迁移锁以 503 拒绝
- **THEN** 响应提示 SHALL 包含迁移源 → 目标标识、完成后自动恢复说明与「进度见数据迁移页」指引，MUST NOT 仅提示「请稍后重试」

#### Scenario: 锁开始时间展示正确
- **WHEN** 迁移锁进行中，用户查看全局横幅或「当前任务」卡片中的迁移开始时间
- **THEN** 展示时间与真实墙钟的偏差 SHALL 在分钟级内（后端存储修正为 naive UTC，前端按 UTC 解析、Asia/Shanghai 展示）
