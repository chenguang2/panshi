# Verification · db-migration-history-detail

日期：2026-11-27

## 回归证据

- 后端 RED→GREEN：新增 `TestMigrationHistoryDetail` 4 用例 + PG 冒烟 round-trip 1 用例，实现后全绿；迁移域回归 `test_database_api / test_db_migration_service / test_migration_stream_api / test_migrate` 117 passed；`TEST_DB_BACKEND=pg uv run pytest tests/test_pg_dialect_smoke.py -q` 12 passed（含新 round-trip）。
- 路由遮蔽（design D2 预判）：`GET /history/{log_id}` 初版声明在 `/history/cleanup-preview` 之前将其吞成 422——已移至 `/history` 字面量路由族之后（现序：list → cleanup-preview → cleanup → DELETE {id} → GET {id}），回归绿。
- 前端：`vue-tsc -b` 通过；迁移域 9 文件 410 用例全绿（迁移卡/历史卡/共享抽屉/守卫/状态带/页面/parity/pageHeader）；全量 vitest 2 例失败均为未触碰文件（跳板复检/剪贴板回退），隔离复跑全绿——按 AGENTS #58 定性漂移。
- 守卫：`DbMigrationDetailDrawer.source.test.ts` 钉抽屉单实现（仅一处定义、两卡消费、has_detail 门控）；mockupParity mig-⑧ 随新架构更新。

## 真机链路（Playwright 直连常驻服务）

1. 后端重启加载新代码（旧 worker 僵死未热载——#35 文档化形态；stop.sh/start.sh 全量重启后 health 200），启动期 `COLUMN_MIGRATIONS` 已把 `tables_detail` 列落到活动库（PRAGMA 复核），`GET /history` 行带 `has_detail`。
2. 造 1 条带明细的成功记录（backup_path 带 `detail_seed` 标记）→ 真机：展开行出现「查看迁移详情」→ 点击 → 760 抽屉打开，概要（源/目标/表数 4/耗时 34.2 秒/备份路径）全部取自该条记录，三组表明细（业务表 2 · 审计与导入日志 1 · 任务日志 1）正确渲染，后续步骤保留——截图 `real-history-detail-drawer.png`。
3. 验证后种子行已按标记精确删除（复核 remaining=1）。

## 待用户侧复核

- tasks 4.2 的真实迁移腿：下次真实迁移完成后确认「完成态抽屉 → 刷新 → 历史行展开回看同一明细」全链路（写入路径已由 pytest 流式测试 + 持久化用例覆盖）。
- 手册 19 章两张截图（19-migration-05/06）为改版前旧图，文字已更新，重拍走 manual-screenshots 产线。
