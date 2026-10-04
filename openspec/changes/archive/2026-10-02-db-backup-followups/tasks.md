# Tasks: 2026-10-02-db-backup-followups

> 追溯性建档：代码已合入（bc1b5b4c、336da64d、1880a925），以下为实际执行记录。

## 1. 页签风格与常驻层间距（bc1b5b4c）

- [x] 1.1 `DbBackupCard.vue` 页内 Tab 改页签（folder）风格：全宽分隔线画于页签条底边、激活页签表面色底 + 强调色顶条叠住分隔线
- [x] 1.2 常驻状态层（统计条）底部留出与内容区的间距

## 2. 「恢复此包」直达第 2 步（336da64d）

- [x] 2.1 （RED）`DbBackupRestoreWizard.ux.test.ts`：preselectTargetId 直达——开门即按该位置自动列包并预选包
- [x] 2.2 （GREEN）历史行捕获首个成功位置 → `preselectTargetId` → `initSource` 切已配置模式/选中/自动列包；位置已删回退「全部位置」聚合
- [x] 2.3 「恢复数据…」（常驻层）与「恢复数据」（摘要卡）改 btn-danger-outline 红描边
- [x] 2.4 `DbBackupCard.ux.test.ts` 断言更新；docs 20 章口径同步 + 手册截图 2 张更新

## 3. 「备份于 Invalid Date」修复（1880a925）

- [x] 3.1 （RED）`test_db_backup_service.py` meta 格式用例 + `format.test.ts` 注记后缀用例
- [x] 3.2 （GREEN）`db_backup_service.py` created_local 改裸 ISO8601；`format.ts` parseBackendDate 剥「（Asia/Shanghai）」注记后缀
- [x] 3.3 回归：wizard+card vitest 全绿、`npx vue-tsc -b` 干净
