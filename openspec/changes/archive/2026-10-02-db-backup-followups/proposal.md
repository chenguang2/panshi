# Proposal: 2026-10-02-db-backup-followups

## Why

备份页 UI 硬化后的三笔跟进：① 备份页统计条（常驻状态层）与页签内容区贴死无间距、页内 Tab 无页签视觉（bc1b5b4c）；② 历史「恢复此包」虽能打开向导并预选包，但用户仍需手动选备份来源位置、手动列包——直达体验断在第一步（336da64d）；③ 恢复向导包列表「备份于 Invalid Date」——`created_local` 带了「（Asia/Shanghai）」注记后缀，前端 Date 解析失败（1880a925）。

## What Changes

- `bc1b5b4c` 备份页页内 Tab 改页签（folder）风格（全宽分隔线画于页签条底边、激活页签表面色底 + 强调色顶条叠住分隔线）；常驻状态层底部留出与内容区的间距
- `336da64d` 历史「恢复此包」直达向导第 2 步：历史行捕获该包首个成功位置 → `preselectTargetId` 传入向导 → 开门 `initSource` 自动切「已配置位置」模式、选中该位置、自动列包 → 既有 `preselectPackageName` 逻辑自动选中目标包并进入第 2 步（安全闸保留：仍需手动「校验此包」与确认）；位置已被删除时回退「全部位置」聚合；「恢复数据…」与摘要卡「恢复数据」入口改 btn-danger-outline 红描边（与向导内 btn-danger 实心确认形成「入口→确认」高危视觉递进）；docs 20 章口径同步
- `1880a925` 恢复向导「备份于 Invalid Date」修复：后端新包 meta 的 `created_local` 改记裸 ISO8601 本地时间（去掉「（Asia/Shanghai）」注记后缀）；前端 `parseBackendDate` 兼容剥离存量注记后缀格式

## Capabilities

### Modified

- `sqlite-remote-backup`：「历史可读性与恢复打通」（直达第 2 步 + 位置已删回退）、「摘要卡口径与入口样式对齐」（恢复入口危险描边递进）、「备份页分区结构与常驻状态层」（页签风格 + 常驻层间距）
- `sqlite-backup-restore`：「远端备份列表与包内容明示」补备份时间渲染兼容场景

## Impact

- 前端：`frontend/src/components/DbBackupCard.vue`、`DbBackupRestoreWizard.vue`、`DbBackupSummaryCard.vue`、`frontend/src/utils/format.ts`
- 后端：`backend/app/services/db_backup_service.py`（meta created_local 格式）
- 测试：`DbBackupCard.ux.test.ts`、`DbBackupRestoreWizard.ux.test.ts`（preselectTargetId 直达用例）、`test_db_backup_service.py`（meta 格式）、`format.test.ts`（注记后缀兼容）
- 文档：`docs/user-manual/20-backup-management.md`、手册截图 2 张更新
- 与既有措辞的区分：multi-target spec 中的「直达」指灾难恢复入口打开恢复向导；本特性的「直达」是历史行「恢复此包」跳过来源选择、开门即列包并预选，二者入口不同、语义互补
