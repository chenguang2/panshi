# db-backup-dr-ux-optimization 任务清单

> 约定：全部按 TDD（先 RED 验证失败原因，再 GREEN）；后端测试复用 `tests/api_helpers.py`；前端组件测试 mock 形状取自真实接口（#43）；改行为语义时回归同域既有测试（#51④）。评审基线截图 13 张已留存 /tmp/opencode/backup-ux-shots/。

## 1. 后端 · 恢复响应契约（P0，design D1）
- [x] 1.1 RED：新增 `backend/tests/test_restore_response_contract.py`——mock/直调恢复执行端点，断言响应体包含服务层全部 11 键（含 schema_reconciled/tables_added/columns_added/columns_added/key_changed/restart_recommended/schema_migration_error）；先验证当前 5 键实现跑红
- [x] 1.2 `app/api/v1/db_backup.py` 恢复执行端点改为透传服务层完成态载荷（键集合以服务层返回为准）；GREEN 1.1
- [x] 1.3 反向有效性验证：人为从服务层载荷删一个键 → 1.1 变红，复原后复绿（pg-dialect 冒烟同款模式）

## 2. 后端 · 立即备份反馈与错误归因（P0/P1，design D2/D7/D8）
- [x] 2.1 RED：`tests/test_db_backup_run_feedback.py`——构建成功推送全败 → HTTP 200 且响应体 status='failed' + 逐位置子结果结构；部分失败仍 200 status='partial'；任务冲突仍 409（三态分顺）
- [x] 2.2 `db_backup_service.py`/`db_backup.py`：全败不再 raise→409，改为携带结构化结果的 200（status 字段与 success/partial 同构）；409 仅保留任务冲突语义
- [x] 2.3 RED：`tests/test_db_backup_error_zh.py`——构造 Connection refused / 认证失败 / sshpass 缺失三类失败，断言错误首句中文归因含 host:port 与「请检查」导向、原文保留在 detail
- [x] 2.4 `db_backup_service.py` 错误构建处新增中文归因映射（errno/输出关键词分类，单点定义）；GREEN 2.3
- [x] 2.5 RED：status 载荷断言——迁移运行中时 `suspended_reason` 非空、常态缺省；`db_backup_service` status 构建处补键；GREEN
- [x] 2.6 回归：`uv run pytest -k "backup or restore" -q` 全绿（既有断言 409 语义的用例按新语义修正并在汇报中列出）

## 3. 后端 · 历史清理能力（ADDED，design D12）
- [x] 3.1 RED：`tests/test_db_backup_history_cleanup.py`——keep_last=50 清 250（主表+子结果同删）、purge_all、条件缺失/同时携带 422、审计 detail 含条件与条数、无权限 403、未认证 401
- [x] 3.2 `app/api/v1/db_backup.py` 新增 `POST /db-backup/history/cleanup`（body 二选一校验）+ `db_backup_service` 清理服务（单事务）；`tests/test_security_guard.py` UNAUTHENTICATED_SAMPLES 补采样
- [x] 3.3 GREEN 3.1；回归 `-k "backup or security_guard"` 全绿

## 4. 前端 · 备份主页（P0/P1，design D3-D6/D8-D10/D13）
- [x] 4.1 RED：DbBackupCard.test——0 启用位置时立即备份禁用 + tooltip 文案；「从未备份」格与 statusHint 拆分断言
- [x] 4.2 `runDisabled` 增加 `enabledTargetCount===0`；统计格/statusHint 文案拆分；「搁浅语义」删除确认文案、开关旁状态语序文案（D3/D4/D13）
- [x] 4.3 RED：路由离开守卫用例（dirty 时 onBeforeRouteLeave 弹确认，确认放行/取消留下）；实现（D5，复用 M6 确认语义）
- [x] 4.4 RED：全败结构化结果用例——runResult 弹窗 failed 态渲染（逐位置错误可展开）、409 冲突仍走 toast；实现（响应处理按 200 三态归一，D2 前端半）
- [x] 4.5 RED：「备份历史」Tab 红点角标用例（lastStatus=failed 显示；查看展开原因/备份成功后清除）；实现（D8 前端半）
- [x] 4.6 RED：最近推送列拆分用例（列内健康点+相对时间，手动测试结果行下展开）；实现（D9）
- [x] 4.7 RED：恢复此包屏蔽用例（全败/构建失败记录无按钮、显示说明文案；成功记录可用）；实现（D6，v-if 收紧到「存在推送成功子结果」）
- [x] 4.8 RED：筛选上限披露用例（筛选区常驻「仅筛选最近 200 条」）；实现（D10）
- [x] 4.9 「定时调度」格迁移暂停染黄 + 提示（消费 suspended_reason，D8 前端半）
- [x] 4.10 `src/api/database.ts`/`src/types/dbBackup.ts`：cleanup 端点封装 + 类型（恢复结果类型核对 D1 六字段已声明）；GREEN 全组

## 5. 前端 · 恢复向导自动校验（P1，design D11）
- [x] 5.1 RED：DbBackupRestoreWizard.test——历史直达（携带 preselect 标记）列包成功且预选命中后自动发起校验（校验中态出现、来源标注一致）；手动进入不自动校验
- [x] 5.2 实现：预选命中分支触发 doVerify（同路径同标注）；GREEN

## 6. 收口与验收
- [x] 6.1 全量前端 `npx vitest run --maxWorkers=4` 全绿 + `npx vue-tsc -b` 零错误；后端 `uv run pytest -k "backup or restore or security"` 全绿
- [x] 6.2 E2E 实测（Playwright 直连 12345）：真实失败链路（无 sshd 造全败）验证结构化弹窗 failed 态与错误中文归因上屏；路由拦截 mock 验证 success/partial 弹窗与红点角标；历史清理真实调 API（清理评审残留测试记录）+ 保留 N 条；恢复向导直达自动校验（mock 列包/校验）；截图留档
- [x] 6.3 用户手册备份章节（20-backup）文案与截图随新 UI 更新（git add -f 入库，#8）
- [x] 6.4 `openspec validate --all` 0 error；按 #53 归档合并 delta 至主 specs
