# 任务：备份多目标（多位置扇出与独立页面）

> 约定：每组先写失败测试（RED）并验证失败，再最小实现（GREEN）验证通过；勾选即完成。触及写库路径（新表/新查询），合入前必须过 PG 方言冒烟（memory #103）；新端点必须补安全守卫采样（rule #19）；改语义后回归范围覆盖同域既有测试（rule #51-④）。

## 1. 模型与存量迁移

- [x] 1.1 RED：`DbBackupTarget` / `DbBackupHistoryTarget` 模型用例（字段齐全、name 唯一约束、子结果 target_name 快照、target_id 悬挂无 FK 强制）；`ensure_targets_migrated` 用例（标志假+旧 host 非空 → 建「默认位置」复制全部旧目标字段并置位标志；标志真不触发（含位置被删光场景）；旧 host 为空不触发；重复调用不重复建；并发双调用恰好建一条）
- [x] 1.2 GREEN：`models/db_backup.py` 新两表 + `targets_migrated` 标志列；`db_backup_service.ensure_targets_migrated()`（迁移后置位标志）；挂载 lifespan 启动 + `GET /config` 首读兜底
- [x] 1.3 `ps_db_backup_config.targets_migrated` 新列登记 COLUMN_MIGRATIONS（memory #118，布尔默认假）

## 2. 位置 CRUD 与权限切换

- [x] 2.1 RED：schemas 用例（TargetCreate/Update/Response：name 非空 ≤64、允许中文、拒路径分隔符/控制字符/首尾空白且全库唯一、retain_count ≥ 1、密码留空=不修改、响应不回显）；API 用例（POST/PUT/DELETE `/db-backup/targets`、`POST /db-backup/targets/test`、GET/PUT `/config` 两层化——全局字段与 targets 数组）
- [x] 2.2 GREEN：`schemas/db_backup.py` + `api/v1/db_backup.py`；全部端点权限键切 `db_backup`（`require_permission("db_backup")`）；403 用例（有认证无键）
- [x] 2.3 `tests/test_security_guard.py` UNAUTHENTICATED_SAMPLES 补全部新端点采样；`audit` ROUTE_MAP 增位置 CRUD 条目（删路由手工清理——rule #37）

## 3. 扇出执行与三态

- [x] 3.1 RED：服务层用例——一次构建多位置推送（FakeRemote 多目标断言包只构建一次）、单位置失败继续下一位置、三态汇总（全成=success / 部分=partial / 全败=failed；构建阶段失败=failed 无子结果行）、`last_success_at` 仅全绿更新、每位置独立 retain_count 清理、无启用位置手动备份报错、调度跳过（无启用位置）、error 汇总拼接
- [x] 3.2 GREEN：`_perform_backup_locked` 扇出改造 + 历史主记录三态 + 子结果写入；`GET /history` 响应扩展（status 三态 + targets 子结果数组）
- [x] 3.3 更新断言单目标语义的既有用例（grep `run_backup|cleanup_retention|retain_count` 相关既有测试逐一核对）

## 4. 恢复侧按位置列包

- [x] 4.1 RED：`restore/list` 用例——`target_id` 参数查单位置；聚合模式（无 target_id 且无手输参数）按包名去重合并、行标注存在位置、单位置不可达降级标注不阻断
- [x] 4.2 GREEN：`db_restore_service.list_remote_packages` 扩展（位置参数化 + 聚合）；API 参数二选一校验
- [x] 4.3 更新既有恢复列包用例（适配新参数形态）

## 5. 前端：独立页与组件改造

- [x] 5.1 新页 `views/BackupManagement.vue`（mockup 屏 1 口径 + 页面标题区；根元素不设 padding——memory #99）+ 路由 `/backup-management` + 菜单（系统管理分类、数据库管理旁）+ `navMeta` 搜索注册 + 前端权限 keys 注册（双端对齐）
- [x] 5.2 `DbBackupCard.vue` 改造：全局表单（开关/间隔/**来源标识可编辑**（空=自动解析；mockup 只读口径覆盖）/内容段）+ 位置表格（启用开关/名称/地址/目录/保留份数/操作）+ 470px 编辑抽屉（身份→连接→认证→存储→策略；测连内联反馈条；密码留空不修改文案；**保留份数 hint 注明时间跨度 ≈ 份数 × 间隔**）+ 历史区 partial 黄徽章 + `N/M 目标` 小注 + 展开行子结果 + **立即备份结果弹窗展示每目标子结果**
- [x] 5.3 `DatabaseManagement.vue` 原备份卡换摘要卡（四格统计 + 最近一次结果 +「进入备份管理」「灾难恢复」双入口；无配置引导文案；**渲染挂 db_backup 前端权限**）
- [x] 5.4 向导 step1 改造：单选卡片（已配置位置 / 手动输入）+ 位置下拉（全部位置聚合 + 停用标注）+ 手输表单保留（默认路径随配置空态切换）
- [x] 5.5 `api/dbBackup.ts` + `types/dbBackup.ts` 扩展（targets CRUD、history 子结果、restore/list target_id/聚合）
- [x] 5.6 vitest 组件测试（位置表格/抽屉校验/摘要卡/向导选择/聚合标注）+ `npx vue-tsc -b` 通过；模板多语句 handler 提取 script 函数（rule #25）

## 6. 文档与回归

- [x] 6.1 `docs/design/sqlite-backup-dr.md` 同步（两层配置模型、扇出与三态、位置管理、独立页面与摘要卡、存量迁移与回滚语义、删除位置搁浅说明）
- [x] 6.2 全量后端 pytest + `TEST_DB_BACKEND=pg` 方言冒烟（新表/写库路径）
- [x] 6.3 前端 vitest 全量；e2e 受影响项核查（数据库管理页相关 spec 按新结构核对）
  - 终验（2026-09-30）：后端全量 2090 passed / 12 skipped / 0 failed；PG 方言冒烟 7 passed（本机 PG16，rule #103）；安全守卫采样含全部 targets 端点；`vue-tsc -b` exit 0；vitest 全量 1031/1031（`--retry=2`，5s 超时为并发资源抖动——失败集逐轮不重叠、隔离单跑全绿 28/28，非语义回归）；e2e `database-management.spec.ts` 5 passed（页面渲染/连接列表/迁移卡均不受摘要卡置换影响）
