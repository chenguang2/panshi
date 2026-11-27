# Proposal

## Why

迁移详情抽屉（概要四格 + 备份路径 + 业务表/审计与导入日志/任务日志三组逐表明细 + 后续启用步骤）目前只有一个瞬时入口：迁移完成时的 SSE 完成事件把 `tables` 明细存在前端内存里，结果条上的「查看迁移详情」按钮随刷新/离开页面即消失。后端迁移历史（`ps_db_migration_log`）只存表数量/备份路径/错误信息，不存逐表明细——历史行展开只能看失败原因与备份路径，**任何一次迁移的明细都无法回看**（包括刚完成但刷新过页面的）。用户已裁决：把完成事件的 tables 明细落进历史记录，并从前端接出常驻入口。

## What Changes

- **后端持久化**：`ps_db_migration_log` 新增 `tables_detail` TEXT 列（JSON 字符串；登记 `COLUMN_MIGRATIONS`，缺登记会启动 crash-loop——AGENTS #118）；`record_migration_log` 增加 `tables_detail` 可选参数，**成功路径**调用点传入完成事件的 tables 明细（`{name, columns, rows, kind}` 列表）；失败/中断路径不写（NULL）。写入显式 `json.dumps`（TEXT-JSON 列必须显式序列化——AGENTS #48 / PG 严格类型）。
- **读取端点**：新增 `GET /database/history/{log_id}` 返回单条完整记录（含解析后的 `tables` 数组），列表载荷不变；404 = 记录不存在。权限与功能门控与列表端点同源（`require_db_admin('db_migration')` + `_require_migration_feature`）。
- **列表标记**：`GET /database/history` 每行新增 `has_detail`（`tables_detail` 非空），前端据此渲染入口——存量旧记录（无明细）不出现死按钮，行展开保持现状两行。
- **前端共享抽屉**：明细抽屉从 `DbMigrationCard` 提取为 `DbMigrationDetailDrawer.vue`（视图模型 props：源/目标名、表数、耗时文案、备份路径、tables 数组）；迁移卡（实时完成）与历史卡（历史记录按需拉取）共同消费，**不出现第二份抽屉实现**（AGENTS #51 单实现纪律）。
- **前端入口**：历史行展开区在 `has_detail` 为真时增加「查看迁移详情」文本按钮 → 拉取 `GET /database/history/{id}` → 打开共享抽屉（源/目标/表数/耗时取自该条历史记录）。设计页 `db-migration.html` 展开行样张同步补该按钮（#82 推论：有意新增控件必须回填设计页）。
- **存量语义**：旧记录无明细 → 入口隐藏、行为不变；不做任何回填。清理历史照旧整行删除（明细随行走）。
- **零行为变更**：迁移执行/写锁/SSE 事件格式/清理预览与执行/历史列表条数上限（100）全部不动。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `database-management`：MODIFIED「迁移历史记录」——成功迁移的完成明细（逐表列数/行数/分组）随记录持久化，并提供单条明细读取端点；既有两个场景（查看迁移历史 / 迁移历史不随数据迁移）语义不变。

### Added Capabilities

- `db-migration-page`：ADDED「迁移历史明细入口与共享详情抽屉」——历史行展开的明细入口（has_detail 门控）与迁移卡/历史卡共享的单抽屉实现。

## Impact

- `backend/app/models/db_migration.py`：`tables_detail` TEXT 列。
- `backend/app/core/migrate.py`：`COLUMN_MIGRATIONS` 登记。
- `backend/app/services/db_migration_service.py`：`record_migration_log` 参数与写入（json.dumps）。
- `backend/app/api/v1/database.py`：成功调用点传明细；列表行 `has_detail`；新增 `GET /history/{log_id}`。
- `frontend/src/types/database.ts`、`frontend/src/api/database.ts`：`has_detail` 类型与明细拉取函数。
- `frontend/src/components/DbMigrationDetailDrawer.vue`（新，从 DbMigrationCard 提取）；`DbMigrationCard.vue`、`DbMigrationHistoryCard.vue` 接共享抽屉与入口。
- `docs/ui/Live-Artifact-5/proposal-c/db-migration.html`：展开行样张补「查看迁移详情」按钮。
- 测试：`backend/tests/test_database_api.py`（或迁移域测试）持久化/端点/404 用例；PG 方言冒烟 `tests/test_pg_dialect_smoke.py` 补 TEXT-JSON round-trip 覆盖（#31 触发：本次动 schema/写库路径）；前端 `DbMigrationHistoryCard.test.ts` / `DbMigrationCard.test.ts` / 新共享抽屉测试。
