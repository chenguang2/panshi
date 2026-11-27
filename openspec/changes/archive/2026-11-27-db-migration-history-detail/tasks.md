# Tasks

## 1. 守卫先行（RED）

- [x] 1.1 后端：新增迁移域测试用例——①成功迁移记录 `tables_detail` 持久化（明细形状取自真实 `migration_result["tables"]`）；②列表行 `has_detail` 真/假两态（旧记录/失败记录为假）；③`GET /database/history/{id}` 200 返回解析后 `tables` 数组、404（断言 JSON 404 而非 HTML，#34）；④损坏 JSON 容错为空——运行确认 RED
- [x] 1.2 PG 方言冒烟补 TEXT-JSON round-trip 用例（`tests/test_pg_dialect_smoke.py`，本变更动 schema/写库路径——#31/#103），确认 RED
- [x] 1.3 前端：`DbMigrationHistoryCard.test.ts` 加入口两态用例（has_detail 真→「查看迁移详情」按钮+点击拉取+开抽屉；假→无按钮）；新增共享抽屉单实现源码守卫（`DbMigrationDetailDrawer` 仅一处定义、`DbMigrationCard`/`DbMigrationHistoryCard` 均 import 消费）——确认 RED

## 2. 后端持久化与端点（GREEN-1）

- [x] 2.1 `models/db_migration.py` 增 `tables_detail` TEXT 列；`core/migrate.py` `COLUMN_MIGRATIONS` 登记（逐字核对，#118）
- [x] 2.2 `record_migration_log` 增 `tables_detail` 可选参数（`json.dumps` 显式序列化）；成功调用点传 `migration_result.get("tables")`；失败/导出/导入腿零改动；验证 1.1 转绿
- [x] 2.3 `GET /database/history` 行增 `has_detail`；新增 `GET /database/history/{log_id}`（同源权限+功能门控；解析 `json.loads`，损坏容错为空；404 JSON）——注意注册在 `/history` 族内不遮蔽既有路径；验证 1.1/1.2 全绿

## 3. 前端共享抽屉与入口（GREEN-2）

- [x] 3.1 新建 `DbMigrationDetailDrawer.vue`（视图模型 props；解剖 = `a-drawer` 760 + `.mig-desc` 四格 + 备份路径通栏 + `grid-table` 三组明细 + 日志豁免提示 + 后续步骤）；`DbMigrationCard` 改为消费该抽屉（结果条实时入口数据装配迁为视图模型），删除内联抽屉模板；验证迁移卡实时入口回归
- [x] 3.2 `types/database.ts` + `api/database.ts`：`has_detail` 类型、`getMigrationHistoryDetail(id)`；历史卡展开区 `has_detail` 门控入口（点击拉取→开共享抽屉，源/目标/表数/耗时取记录值）；验证 1.3 转绿
- [x] 3.3 设计页 `db-migration.html` 展开样张补「查看迁移详情」按钮（与「复制」同行族形态）

## 4. 回归收口

- [x] 4.1 `npx vue-tsc -b`；定向后端迁移域测试 + `TEST_DB_BACKEND=pg uv run pytest tests/test_pg_dialect_smoke.py -q`（#31 触发必跑）；前端定向（迁移卡/历史卡/共享抽屉/守卫）+ 全量 vitest（漂移按 #58 定性）
- [x] 4.2 真机链路（明细种子记录 + Playwright 直连）：展开行「查看迁移详情」→ 760 共享抽屉，概要/三组明细数据取自该条记录；启动期 COLUMN_MIGRATIONS 落列复核；种子已清理（详见 verification/verification.md）。真实迁移全链路复核留待用户下次真实迁移（写入路径已由 pytest 流式 + 持久化用例覆盖）
- [x] 4.3 手册核对：docs/user-manual 迁移章节如载有「明细仅完成态可见」表述则同步修正
