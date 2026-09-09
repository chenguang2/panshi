## Why

当前数据库迁移界面只有一个假进度条（固定 95%），用户无法了解迁移的真实进展。对于大库迁移（数万行数据），用户不知道迁移到了哪个表、处理了多少行，也无法设置超时时间来防止大库迁移卡死。

## What Changes

- **迁移进度实时展示**：迁移过程中显示当前表序号/总表数、当前表名、当前表已迁移行数/总行数，替代现有的假进度条
- **备份阶段进度**：替换模式迁移的备份阶段也纳入进度流，显示"正在备份源库…"
- **跳过不存在的表**：源库缺表时显示"跳过：表名（表不存在）"而非闪烁的 0 行进度
- **迁移超时设置**：在迁移表单中增加超时时间下拉框，默认 5 分钟，可选 1/3/5/10/30 分钟
- **协作式取消**：超时或断开连接后通过 threading.Event 让线程在安全点退出
- **后端进度推送**：迁移 API 改为 SSE 流式响应，实时推送每个表的迁移进度（表名、行数、序号）
- **前端进度渲染**：前端通过 fetch + ReadableStream 接收进度事件，实时更新进度条和文字信息

## Capabilities

### New Capabilities
- `migration-progress-stream`: 迁移过程 SSE 流式进度推送与前端实时渲染，包含表级和行级进度信息

### Modified Capabilities
- `database-management`: 迁移表单增加超时时间设置，迁移进度区域从假进度条改为实时进度展示

## Impact

- **后端**：`database.py` 迁移端点改为 StreamingResponse（SSE），`db_migration_service.py` 的 `progress_cb` 接入实际回调
- **前端**：`DatabaseManagement.vue` 进度区域重写，`api/database.ts` 迁移调用改为接收 SSE 流
- **API**：`POST /database/migrate` 响应类型从 JSON 改为 `text/event-stream`，需前端适配
- **依赖**：无新增外部依赖，SSE 由 FastAPI StreamingResponse 原生支持
