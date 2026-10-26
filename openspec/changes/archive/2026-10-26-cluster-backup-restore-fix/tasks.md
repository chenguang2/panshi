# Tasks: cluster-backup-restore-fix

## 批 1 · P0 根因修复（时间矫正 + 运行态重置，TDD 先行）

- [x] 1.1 RED：新增 `backend/tests/test_cluster_backup_import_datetime.py`——用 test 形状数据构造含「已发布静态资源」的备份文档（`last_published_at` 为 ISO 字符串），断言 `import_backup` 成功且新行时间列为 datetime/None
- [x] 1.2 GREEN：`_entity_kwargs` 增加模型感知时间矫正（D1：DateTime/Date 列 str → `fromisoformat`，失败置 None）；同测试追加断言 `last_publish_ok/last_publish_detail/last_published_at` 导入后全空（D2：static 分支剔除运行态键）
- [x] 1.3 回归：`cd backend && uv run pytest -k "backup" -q` 全绿（250 passed）；`TEST_DB_BACKEND=pg uv run pytest tests/test_pg_dialect_smoke.py -q`（约定 #103，11 passed）

## 批 2 · region_code 保留（Cluster 导入模型感知，TDD 先行）

- [x] 2.1 RED：1.1 测试文件追加用例——源集群 `region_code="aoh"` → 导入后新集群 `region_code=="aoh"` 且 `status==1`、name 为指定名
- [x] 2.2 GREEN：Cluster 导入改 `_entity_kwargs(src, 0, model=Cluster)` + 强制 name/status/creator_id、剔除 admin_key（D3）

## 批 3 · 失败无副作用 + 错误可读（TDD 先行）

- [x] 3.1 RED：测试追加——写盘后、commit 前注入失败，断言 rollback 后磁盘无本次 zip 残留（D4 清理路径）；service 抛 `ValueError("导入失败：…")` 且 API 层映射 400 `detail.errors`（D5，`BackupImportError` 标记子类区分语义错误与意外异常）
- [x] 3.2 GREEN：落盘时序改为行全部就绪后统一写盘 + except 路径 `unlink` 清理；`import_backup` except 分支 stage 定位转译（原始堆栈仍记日志）；既有守卫 `test_rollback_on_midway_failure` 注入点/断言同步新契约
- [x] 3.3 端到端验证：test 集群实走「导出（含文件+密钥）→ 导入 → HTTP 200（原 100% 500）+ region_code 源值保留 + 运行态三列全空」+「篡改 → 400 校验和不符可读错误」，探测集群已删除清理（DELETE 带 JSON body，约定 #60）

## 收口

- [x] 4.1 全量 `uv run pytest`：2541 passed / 1 failed（`test_clickhouse_client` 配置用例，stash 掉本改动后仍红——运行态 clickhouse.yaml 触发的既有环境失败，与本改动无关，约定 #58 判定）；后端 diff 自该轮后未再变更，收口前备份域 26/26 复跑绿。~~前端零改动~~ → 已被 central-management-ux-review-fixes 批 2 部分推翻：`useClusterBackup` 补校验和接线、弹窗错误区补建议动作行——后端 `detail.errors` 契约不变（`join('；')` → `errorLines`），前端消费路径经组件测试覆盖（错误区逐条呈现断言绿）
- [x] 4.2 `openspec validate --all` 0 error（196 passed，收口时含批 5-7 后复跑确认）；文档同步完成（AGENTS.md 约定 #17 补「UI 术语用导入不用恢复」+ 运行态不迁移 + 时间矫正 + 失败无副作用）
