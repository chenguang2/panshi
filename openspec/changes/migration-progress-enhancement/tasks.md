## 1. 后端：迁移服务进度回调

- [ ] 1.1 定义 `MigrationCancelled` 异常和 `MigrationProgressEvent` 数据结构（type/table_index/total_tables/table_name/total_rows/copied_rows/skipped 字段）
- [ ] 1.2 修改 `_copy_table` 函数：开头加 `SELECT COUNT(*)` 获取 total_rows；增加行级 progress_cb，在每批次插入后回调；返回结果增加 `skipped` 字段
- [ ] 1.3 修改 `migrate_direct` 函数：接收 `cancel_event: threading.Event` 和 `progress_cb`，在每表开始时检查 cancel_event（set 则 raise MigrationCancelled），在表开始/完成时调用 progress_cb 传递详细信息（含 skipped 标记）
- [ ] 1.4 修改 `export_archive` 函数：增加 `progress_cb` 参数，每张表备份时回调

## 2. 后端：SSE 流式迁移端点

- [ ] 2.1 修改 `database.py` 的 `migrate_database` 端点，改为 `StreamingResponse(media_type="text/event-stream")`，路由参数增加 `timeout`（默认 300 秒）
- [ ] 2.2 实现 SSE generator：创建 threading.Event，用 `asyncio.to_thread` + `asyncio.wait_for` 启动迁移线程，超时后 set event
- [ ] 2.3 generator 内部管理迁移锁（try/finally set True/False），处理备份阶段进度（type: "backup"）
- [ ] 2.4 generator 内部捕获 `ClientDisconnect` 异常，set cancel_event 让线程退出
- [ ] 2.5 generator 内部通过独立 async session 写入迁移记录和审计日志（成功/失败都写）
- [ ] 2.6 实现 SSE 事件序列化：将进度事件转换为 `event: xxx\ndata: {...}\n\n` 格式，complete/error 事件作为最后事件发送

## 3. 前端：SSE 客户端与进度渲染

- [ ] 3.1 修改 `types/database.ts`，增加 `MigrationProgressEvent` 类型（含 backup/table_start/table_progress/table_complete/complete/error，table_start 含 skipped 字段）
- [ ] 3.2 修改 `api/database.ts` 的 `migrateDatabase` 函数，用 fetch + ReadableStream 替代 axios 调用，支持 POST body 和 SSE 流解析（缓冲分割 `\n\n`）
- [ ] 3.3 修改 `DatabaseManagement.vue` 的迁移进度区域：显示备份进度、表级进度（"第 N/M 张表：表名"）、行级进度（"已迁移 X/Y 行"）、进度百分比（按表数算）
- [ ] 3.4 处理 `skipped: true` 的 table_start 事件：显示"跳过：表名（表不存在）"
- [ ] 3.5 增加超时时间下拉框（1/3/5/10/30 分钟），默认 5 分钟，绑定到 `migrateForm.timeout`，迁移中禁用
- [ ] 3.6 处理 complete 事件：显示成功消息和迁移详情表格
- [ ] 3.7 处理 error 事件：显示错误提示信息

## 4. 测试与验证

- [ ] 4.1 编写后端单元测试：验证进度回调在备份、表开始、行批次、表完成时被正确调用
- [ ] 4.2 编写后端单元测试：验证 cancel_event set 后线程在下一个检查点退出并抛出 MigrationCancelled
- [ ] 4.3 编写后端单元测试：验证超时机制在超过指定时间后 set cancel_event 并释放锁
- [ ] 4.4 编写后端单元测试：验证跳过不存在的表时返回 skipped=true
- [ ] 4.5 手动验证：从小 SQLite 迁移到 PG，确认进度信息实时更新
- [ ] 4.6 手动验证：设置短超时（1 分钟），确认大迁移能被正确中断
- [ ] 4.7 手动验证：迁移过程中关闭浏览器，确认后端线程退出且锁被释放
