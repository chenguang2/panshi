# migration-progress-stream Delta

## MODIFIED Requirements

### Requirement: SSE 连接断开处理
系统 SHALL 在 SSE generator 中捕获 `ClientDisconnect` 异常且 **MUST NOT 取消后台迁移**：断连（页面刷新、导航、主动断开进度）后迁移线程继续执行至终态，全局写锁保持至迁移结束，收尾任务（清锁、写迁移历史与审计日志）照常执行。

<!-- 2026-10-31 裁决：原文「触发协作式取消、线程在下一个检查点退出」与实现相悖——database.py 断连路径注释明确 Do NOT cancel（cancel_event 仅超时路径置位），且与 db-migration-page 现文「断连不中断后台迁移」互相矛盾；按实现现状与用户决策（终止语义诚实化：断开监视）修订。 -->

#### Scenario: 前端关闭页面
- **WHEN** 迁移过程中前端关闭页面、网络断开或用户主动断开进度显示
- **THEN** 系统 SHALL 保持迁移线程继续执行（不置取消信号），全局写锁与收尾任务（清锁、写历史/审计）行为与正常完成路径一致

### Requirement: 前端实时进度渲染
前端 SHALL 通过 fetch + ReadableStream 接收 SSE 流（带 Authorization 头），实时更新迁移进度区域。主动断开交互 SHALL 诚实命名为「断开实时进度」：仅断开本页进度显示，MUST NOT 声称迁移已终止或已取消，SHALL 说明迁移仍在后台执行、写锁保持至结束；断开后页面按进行中状态轮询恢复展示。失败与超时提示 SHALL 可理解：展示中文原因分类与处理建议，MUST NOT 仅透传原始异常串或仅提示「失败」。

#### Scenario: 显示备份进度
- **WHEN** 收到 `backup_progress` 事件
- **THEN** 前端 SHALL 显示「正在备份源库…」与备份进度条（表 N / M）

#### Scenario: 显示表级进度
- **WHEN** 收到 `table_progress` 事件（`skipped: false`）
- **THEN** 前端 SHALL 显示「正在迁移数据… 表 N / M」和进度条（百分比 = 已完成表数 / 总表数 * 100）

#### Scenario: 显示跳过的表
- **WHEN** 收到 `table_progress` 事件（`skipped: true`）
- **THEN** 前端 SHALL 在当前表名旁显示「跳过：表不存在」

#### Scenario: 显示行级进度
- **WHEN** 收到 `table_progress` 事件
- **THEN** 前端 SHALL 更新当前表的行数进度（如「已迁移 500/1000 行」）

#### Scenario: 表切换更新
- **WHEN** 收到新的 `table_progress` 事件（table_index 变化）
- **THEN** 前端 SHALL 更新表名和总行数，行级进度随事件刷新

#### Scenario: 用户主动终止
- **WHEN** 用户在迁移进行中点击「断开实时进度」
- **THEN** 前端 SHALL 仅 abort 本页 SSE 连接，并提示「已断开本页进度显示；迁移在后台继续执行，写操作锁定保持至迁移结束」，MUST NOT 提示「迁移已终止」或「已取消」
- **AND** 页面 SHALL 依据进行中状态轮询恢复展示迁移进度

#### Scenario: 迁移完成展示结果
- **WHEN** 收到 `complete` 事件
- **THEN** 前端 SHALL 显示成功消息、迁移详情表格与备份路径

#### Scenario: 迁移失败展示错误
- **WHEN** 收到 `error` 事件
- **THEN** 前端 SHALL 展示中文原因分类与处理建议（连接类/认证类/超时类等，无法分类的原始错误加「迁移失败：」前缀）并结束迁移态，MUST NOT 仅展示原始异常串
- **AND** 超时类错误 SHALL 包含已完成表数与「调大单阶段超时后重试」的建议
