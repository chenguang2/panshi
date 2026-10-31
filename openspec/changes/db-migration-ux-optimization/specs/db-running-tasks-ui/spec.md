# db-running-tasks-ui Delta

## ADDED Requirements

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
