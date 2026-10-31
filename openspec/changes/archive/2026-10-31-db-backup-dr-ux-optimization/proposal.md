# db-backup-dr-ux-optimization 提案

## Why

备份与容灾模块 UX 五维评审（2026-10-31，15 项问题：1 高危 / 6 中 / 8 低）发现三类核心缺陷：
1. **跨层契约断点（高危）**：恢复执行端点丢弃服务层返回的 6 个 D6 契约字段（schema_reconciled/tables_added/columns_added/key_changed/restart_recommended/schema_migration_error），恢复完成页的「schema 补齐说明」与「密钥变更需重启」两段安全提示永不显示——高危操作完成态的关键引导静默失效，且主规格「恢复完成指引闭环」早已要求展示这些信息（实现违规）。
2. **失败路径反馈不对称**：全部位置推送失败被后端收敛为 409、前端只发 3 秒 toast（结构化结果弹窗仅 success/partial 出现）；与「任务进行中冲突」共用 409 语义混淆；SSH 原始英文错误四处直出无中文归因。
3. **易用性与一致性缺口**：0 启用位置时「立即备份」可点击后才报错、脏配置路由离开无拦截、全败包的「恢复此包」可点但必然落空、历史筛选静默上限 200 条不披露、「推送健康」与「手动测试」双信号同列混排、迁移暂停调度 UI 零提示、开发术语「搁浅语义」泄漏。

另经用户裁决：备份历史无清理能力导致记录永久累积，本轮新增清理能力（ADDED capability）。

## What Changes

P0：恢复执行响应契约透传与完成态安全提示修复（高危）；全位置推送失败改为结构化结果反馈（后端 200 化 + 复用结果弹窗，409 仅保留给任务冲突）；0 启用位置时「立即备份」禁用+原因；「从未备份」统计格文案拆分（建议语移入 statusHint）。

P1：脏配置路由离开守卫（onBeforeRouteLeave）；全败包「恢复此包」屏蔽并说明；SSH 失败错误中文归因首句+原文可展开；「最近状态=失败」时备份历史 Tab 红点角标；位置表「最近推送」列语义拆分（健康点+相对时间，手动测试结果行下展开）；「已启用但无启用位置/迁移暂停」策略未生效显式染黄提示（status 增加 suspended_reason）；历史「恢复此包」预选命中后自动发起校验；历史筛选 200 条上限披露；删除确认「搁浅语义」与开关旁「停用定时备份」文案修正。

新增能力：备份历史清理（后端清理端点 + 审计 + db_backup 权限 + 前端入口与确认）。

P2（不入本轮，记待办）：向导包列表 40vh 与选中行校验角标、远端包统计行展开（需新端点）、来源标识高级化、摘要卡「查看」锚点与 Tab 参数化、弹窗可访问性、校验明细 all-or-nothing 语义、校验有效期在完成框的失效展示。

## Capabilities

### New Capabilities
- `db-backup-history-retention`: 备份历史记录的清理能力——按条件（保留最近 N 条 / 清空）删除历史主表与位置子结果记录，写操作审计，挂 db_backup 权限，前端入口带不可恢复确认；解决失败记录永久累积与测试数据残留问题。

### Modified Capabilities
- `sqlite-backup-restore`: 新增「恢复执行响应契约」需求（端点 SHALL 原样透传 D6 六字段，完成页安全提示才可达）；「向导流程体验与状态呈现」补「历史直达预选命中后自动发起校验」场景。
- `sqlite-remote-backup`: 「立即备份未保存守卫与执行预期」补全败结构化反馈与 0 位置禁用场景；「备份页编辑态与已保存态隔离」补路由离开守卫场景；「历史可读性与恢复打通」补筛选上限披露与全败包入口屏蔽场景；「位置健康信号与安全交互」补推送列语义拆分场景；「备份调度触发」补迁移暂停显式提示场景；「备份页分区结构与常驻状态层」补失败红点桥接场景；新增「备份失败错误中文归因」需求。

## Impact

- Affected specs: sqlite-backup-restore（1 ADDED + 1 MODIFIED）、sqlite-remote-backup（6 MODIFIED + 1 ADDED）、db-backup-history-retention（ADDED，全新）
- Affected code:
  - backend: `app/api/v1/db_backup.py`（恢复响应透传、立即备份 200 化、历史清理端点、status 载荷 suspended_reason）、`app/services/db_backup_service.py`（SSH 错误中文归因映射、全败结果结构、历史清理服务、调度暂停原因上报）
  - frontend: `src/components/DbBackupCard.vue`（禁用条件、文案、路由守卫、红点角标、推送列拆分、恢复此包守卫、筛选披露、清理入口、全败结果弹窗复用）、`src/components/DbBackupRestoreWizard.vue`（预选命中自动校验）、`src/api/database.ts`、`src/types/dbBackup.ts`
  - tests: 后端 db_backup 恢复响应/全败结构/清理/归因用例，前端 DbBackupCard/Wizard 用例，`tests/test_security_guard.py` 采样新增清理端点
  - docs: 用户手册备份章节文案与截图
