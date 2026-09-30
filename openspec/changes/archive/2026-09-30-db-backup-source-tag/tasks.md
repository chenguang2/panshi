# Tasks: db-backup-source-tag

> 全程 TDD（规则 #16）：每个实现组先写失败测试（RED）并验证失败，再最小实现（GREEN）。

## 1. 后端：来源标识解析与配置模型

- [x] 1.1 RED：写失败测试——source_name 非法字符（`/`、空格、首字符非字母数字如 `..`/`-x`、>64 字符）保存被拒；空值保存时自动解析（出口 IP → hostname → 兜底常量，逐级回退）并持久化回显；存量空值在首次备份时解析回写且后续备份不再动态探测；恢复落位后保留包内 source_name（继承语义，回归用例）
- [x] 1.2 GREEN：`DbBackupConfig` 增加 `source_name` 列（String(64), nullable）；登记 `COLUMN_MIGRATIONS`（规则 #118）；schemas 增加字段（pattern `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`、max_length=64）；实现 `resolve_source_name` helper（UDP connect 出口 IP → gethostname → "panshi"，清洗后返回）；保存链路与 run_backup 入口接线
- [x] 1.3 触发式跑 PG 方言冒烟：`cd backend && TEST_DB_BACKEND=pg uv run pytest tests/test_pg_dialect_smoke.py -q`（规则 #103：schema 变更必跑）——实测 7 passed（本机 PG16）

## 2. 后端：包命名与白名单正则单点

- [x] 2.1 RED：写失败测试——`_package_name` 产出 `panshi_backup_{source}_{时间戳}.tar.gz`；组合正则匹配新格式与旧格式、拒绝 `.part`/无关文件；旧格式名不误判为带 source 的新格式名（两种格式不相交）；source 含内嵌 `_数字_数字` 形态时拆分仍唯一（时间戳后缀强制不变量）
- [x] 2.2 GREEN：在 `db_backup_service` 单点定义组合 `PACKAGE_NAME_RE` 与 `parse_package_name(name) -> (source|None, ts)`；`_package_name` 改签名接收 source
- [x] 2.3 更新既有用例：grep 测试中引用 `panshi_backup_` 旧命名断言（如 test_db_backup_service / test_db_backup_*），同步为新格式（规则 #51-④：改语义必须覆盖同域既有测试）

## 3. 后端：保留清理按源过滤

- [x] 3.1 RED：写失败测试——混合目录（本源新格式 + 他源新格式 + 旧格式）触发清理：本源∪旧格式按时间戳倒序保留 retain_count 份、删除超出份、他源新格式包不删不计
- [x] 3.2 GREEN：`cleanup_retention` 增加 own source 参数，候选集过滤 + 按解析时间戳排序

## 4. 后端：meta.json 与备份主链路

- [x] 4.1 RED：写失败测试——meta.json 含 `"source"` 字段；`run_backup` 使用存储的 source_name（断言未调用探测函数）
- [x] 4.2 GREEN：`build_package` / `run_backup` 接线 source；`_version_info` 旁新增 source 写入 meta

## 5. 后端：恢复侧

- [x] 5.1 RED：写失败测试——列包同时接受新旧格式并各自解析 source（旧格式 → None）；混合来源包按文件名时间戳倒序（构造字典序与时间序不一致的用例防回退）；meta.source 与文件名不一致时标注
- [x] 5.2 GREEN：`db_restore_service` 删除自有 `PACKAGE_NAME_RE` 改 import 备份侧单点定义；`RestorePackageItem` 增加 `source: Optional[str]`（文件名解析为唯一事实来源）；排序改为解析时间戳倒序
- [x] 5.3 更新既有用例：grep 恢复侧测试中断言旧排序语义（文件名倒序）或旧白名单的用例并同步

## 6. 前端

- [x] 6.1 备份配置表单（DbBackupCard.vue）加「来源标识」输入框：placeholder 说明空则自动解析、保存后回显、共享目录必须各机唯一；api/types 同步字段
- [x] 6.2 恢复向导列表加「来源」列（None 显示 `—`，与文件名解析不一致标注）；恢复完成提示附来源标识检查提醒（显示继承值，提示共享目录双跑需检查）
- [x] 6.3 vitest 相关用例补齐；`npx vue-tsc -b` 通过

## 7. 文档与全量验证

- [x] 7.1 更新 `docs/design/sqlite-backup-dr.md`：命名节（新格式与自动解析）、保留语义（按源过滤、legacy 归属）、风险节（改 source 搁浅旧包、回滚后新格式包不可见需手工清理、共享目录同 source 退化）
- [x] 7.2 无新增端点，确认 `test_security_guard.py` 采样无需变更；跑后端全量 `uv run pytest`（引擎已全局隔离可放心全量）+ 前端 `npx vitest run`——终验：后端 2025 passed / 12 skipped / 0 failed，前端 999/999，PG 冒烟 7 passed，安全守卫 64 passed，`vue-tsc -b` exit 0
