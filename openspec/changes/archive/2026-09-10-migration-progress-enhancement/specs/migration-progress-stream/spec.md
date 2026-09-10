## ADDED Requirements

### Requirement: SSE 流式进度推送
迁移 API SHALL 以 SSE（Server-Sent Events）流式响应返回迁移进度，替代原有的同步 JSON 响应。每个事件包含 `event` 类型和 `data` JSON 负载。

#### Scenario: 备份阶段进度
- **WHEN** 替换模式迁移开始且 `confirmed_clear=True`
- **THEN** 系统 SHALL 先发送 `event: progress` 事件，`data.type` 为 `backup`，包含 `table_name`（当前备份的表名）、`table_index`、`total_tables`

#### Scenario: 迁移开始时发送首个事件
- **WHEN** 迁移任务开始执行（备份完成后）
- **THEN** 系统 SHALL 发送 `event: progress` 事件，`data.type` 为 `table_start`，包含 `table_index`（从 1 开始）、`total_tables`、`table_name`、`total_rows`、`skipped`（boolean，表是否存在）

#### Scenario: 跳过源库不存在的表
- **WHEN** 源库中某张表不存在
- **THEN** 系统 SHALL 发送 `table_start` 事件（`skipped: true`），不发送 `table_progress`，直接发送 `table_complete`（`copied_rows: 0`）

#### Scenario: 行级进度更新
- **WHEN** 某张表的数据复制过程中
- **THEN** 系统 SHALL 在每批次（BATCH_SIZE=500 行）完成后发送 `event: progress` 事件，`data.type` 为 `table_progress`，包含 `copied_rows` 和 `total_rows`

#### Scenario: 单表迁移完成
- **WHEN** 某张表的所有行复制完成
- **THEN** 系统 SHALL 发送 `event: progress` 事件，`data.type` 为 `table_complete`，包含最终的 `copied_rows`

#### Scenario: 全部迁移完成
- **WHEN** 所有表迁移完成
- **THEN** 系统 SHALL 发送 `event: complete` 事件，包含 `message`、`tables_migrated`、`tables`（详情数组）、`backup_path`

#### Scenario: 迁移失败或超时
- **WHEN** 迁移过程中发生错误或超时
- **THEN** 系统 SHALL 发送 `event: error` 事件，包含 `detail` 错误描述

### Requirement: 迁移超时控制
迁移 API SHALL 接受 `timeout` 参数（单位：秒），默认值为 300（5 分钟）。超时后系统 SHALL 通过协作式取消中止迁移并发送 error 事件。

#### Scenario: 使用默认超时
- **WHEN** 请求未传 `timeout` 参数
- **THEN** 系统 SHALL 使用 300 秒（5 分钟）作为超时时间

#### Scenario: 自定义超时
- **WHEN** 请求传入 `timeout=600`
- **THEN** 系统 SHALL 使用 600 秒（10 分钟）作为超时时间

#### Scenario: 迁移超时中止
- **WHEN** 迁移执行时间超过 `timeout` 秒
- **THEN** 系统 SHALL set 取消事件，线程在下一个检查点（每批次/每表开始）退出，发送 error 事件（detail 含"超时"字样）

#### Scenario: 超时后写操作解锁
- **WHEN** 迁移因超时中止
- **THEN** 系统 SHALL 释放迁移锁，恢复写操作可用性

### Requirement: SSE 连接断开处理
系统 SHALL 在 SSE generator 中捕获 `ClientDisconnect` 异常，触发协作式取消。

#### Scenario: 前端关闭页面
- **WHEN** 迁移过程中前端关闭页面或网络断开
- **THEN** 系统 SHALL 捕获 `ClientDisconnect`、set 取消信号，线程在下一个检查点退出

### Requirement: 前端实时进度渲染
前端 SHALL 通过 fetch + ReadableStream 接收 SSE 流，实时更新迁移进度区域。

#### Scenario: 显示备份进度
- **WHEN** 收到 `backup` 事件
- **THEN** 前端 SHALL 显示"正在备份源库…（第 N/M 张表）"

#### Scenario: 显示表级进度
- **WHEN** 收到 `table_start` 事件（`skipped: false`）
- **THEN** 前端 SHALL 显示"正在迁移第 N/M 张表：table_name"和进度条（百分比 = 已完成表数 / 总表数 * 100）

#### Scenario: 显示跳过的表
- **WHEN** 收到 `table_start` 事件（`skipped: true`）
- **THEN** 前端 SHALL 显示"跳过：table_name（表不存在）"

#### Scenario: 显示行级进度
- **WHEN** 收到 `table_progress` 事件
- **THEN** 前端 SHALL 更新当前表的行数进度（如"已迁移 500/1000 行"）

#### Scenario: 表切换更新
- **WHEN** 收到新的 `table_start` 事件（table_index 变化）
- **THEN** 前端 SHALL 更新表名和总行数，重置行级进度计数

#### Scenario: 迁移完成展示结果
- **WHEN** 收到 `complete` 事件
- **THEN** 前端 SHALL 显示成功消息和迁移详情表格

#### Scenario: 迁移失败展示错误
- **WHEN** 收到 `error` 事件
- **THEN** 前端 SHALL 显示错误提示信息

### Requirement: 超时设置 UI
迁移表单 SHALL 包含超时时间下拉框，默认值为 5 分钟。

#### Scenario: 超时下拉框选项
- **WHEN** 管理员查看迁移表单
- **THEN** 表单 SHALL 显示超时时间下拉框，选项为 1 分钟、3 分钟、5 分钟（默认）、10 分钟、30 分钟

#### Scenario: 超时参数传递
- **WHEN** 管理员选择超时时间并点击开始迁移
- **THEN** 前端 SHALL 将超时秒数作为 `timeout` 参数传入迁移 API

#### Scenario: 迁移中禁用修改
- **WHEN** 迁移进行中
- **THEN** 超时下拉框 SHALL 禁用，防止用户修改

### Requirement: 迁移记录与审计日志
系统 SHALL 在 SSE generator 内部通过独立 async session 写入迁移记录和审计日志。

#### Scenario: 迁移成功后写入记录
- **WHEN** 迁移完成
- **THEN** 系统 SHALL 在 SSE generator 内部创建独立 async session，写入 `ps_db_migration_log` 和审计日志

#### Scenario: 迁移失败后写入记录
- **WHEN** 迁移失败或超时
- **THEN** 系统 SHALL 写入 status="failed" 的迁移记录和审计日志
