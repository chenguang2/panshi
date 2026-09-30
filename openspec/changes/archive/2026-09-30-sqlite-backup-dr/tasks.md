# Tasks: sqlite-backup-dr

> 实现遵循 TDD（约定 #16）：每个任务先写失败测试（RED）验证失败，再最小实现（GREEN）；完成一项勾一项。

## 1. 数据模型与配置基础

- [x] 1.1 新增 `app/models/db_backup.py`：`ps_db_backup_config` 单行配置表（含三个 B 类打包开关默认 false、Fernet 密码列）与 `ps_db_backup_history` 历史表；确认 create_all 自动建表（不进 COLUMN_MIGRATIONS，约定 #119）
- [x] 1.2 新增 `app/schemas/db_backup.py`：配置读写/历史/手动触发/恢复向导的 Pydantic 模型；校验 interval ≥ 1、retain_count ≥ 1；密码字段只写不读（响应不回显明文）
- [x] 1.3 单元测试：配置保存后密码为 Fernet 密文、读取响应无明文、非法配置值被拒（RED→GREEN）

## 2. 备份服务（快照→打包→推送→清理）

- [x] 2.1 实现 `app/services/db_backup_service.py` 快照函数：按 db_config 一次性枚举**全部注册 SQLite 连接（与 active 类型无关）**，逐库 `VACUUM INTO` 临时文件；**active 库缺失 → 整体失败；非 active 库缺失/不可读 → 跳过并记入 meta.skipped**；注册表无任何 SQLite 连接时返回不适用
- [x] 2.2 实现打包函数：tar.gz 结构（meta.json 含 app 版本标识「pyproject version + 可得时 git commit，否则 unknown」/active/各库原路径/skipped 清单/文件清单+SHA256；databases/ 按连接 id 平铺；config/ 含**全部存在的 .env.\***；ansible/；data/ 仅勾选项），时间戳 Asia/Shanghai、meta 时间 UTC
- [x] 2.3 实现 SSH 推送：复用 `ansible_service` 模式（sshpass -e / 密钥直连；mkdir -p → **.part 临时名上传 → ssh mv 原子改名**；密码只走 env；sshpass 缺失给中文安装提示；命令脱敏沿用 `_mask_sshpass` 正则；**远端侧命令参数一律 shlex.quote**）
- [x] 2.4 实现远端保留清理：`ssh ls -1` 拉清单 → 仅白名单正则 `^panshi_backup_\d{8}_\d{6}\.tar\.gz$` 参与 → 本地计算超 retain_count 的最旧份 → `ssh rm -f`（.part 残留不计入亦不清理）
- [x] 2.5 单元测试（mock subprocess）：密码不进 argv、shlex 转义生效、白名单过滤、.part 改名时序、清理计算正确、包结构与 meta 清单（原路径/skipped/版本标识）、B 类开关开/关的 data/ 内容差异、垃圾库不打包、active 缺失 vs 非 active 缺失的分层语义（RED→GREEN）

## 3. 调度与 API

- [x] 3.1 `main.py` lifespan 新增备份调度循环（`_relay_refresh_loop` 同款）：30s 检查到期触发、**启用/保存后 30s 内首备**、in-flight 防重入（**备份/恢复共用互斥标志**）、**迁移运行中（`maintenance._migration_lock` 判定）跳过**、阻塞 IO 走 `asyncio.to_thread`、备份全程不持数据库事务（约定 #29）
- [x] 3.2 新增 `app/api/v1/db_backup.py`：配置 GET/PUT（校验）、立即备份（**不要求 enabled，要求配置完整；备份/恢复进行中拒绝**）、历史列表（分页）、测试远端连通；全部挂 `database_management` 权限；配置变更/手动备份写 `log_audit`
- [x] 3.3 `tests/test_security_guard.py` UNAUTHENTICATED_SAMPLES 补全部新端点采样（约定 #19）
- [x] 3.4 集成测试：调度到期触发（scheduled）、防重入、恢复/迁移互斥、注册表无 SQLite 连接跳过、active=PG 时站点库照常备份、历史落库（RED→GREEN）

## 4. 恢复向导（后端）

- [x] 4.1 实现远端列表函数：临时参数 SSH 连接 → `ls` 白名单过滤（忽略 .part）倒序 + 解析各包 meta 摘要（版本/skipped/缺失 B 类段）；版本比较尽力而为（不可比不提示）；下载前存在性校验（被清理则报错提示刷新）
- [x] 4.2 实现下载校验：tar 完整性、逐文件 SHA256 比对、每库 `PRAGMA integrity_check` + 关键表存在性；失败拒绝落位且不改动本地数据
- [x] 4.3 实现落位激活：**高危确认参数强制校验**（未确认拒绝）；**先落 key 文件（.jwt_secret/.env.\*，600）→ 按 meta 原路径落库为 `<原名>.restored-<ts>` → 清理旧 .restored-\* 残留 → 旧活动库改名 .pre-restore-<ts> → active 指向恢复库 → 经现有 `db_switch` 引擎重载激活**（继承运行中任务禁止切换语义）；恢复写审计
- [x] 4.4 确认 security/db_config 的 Fernet key 读取无模块级缓存，有则加失效机制（恢复后解密自洽的前提，design 风险条目）
- [x] 4.5 恢复相关单元/集成测试：损坏包拒绝、未确认拒绝、备份进行中拒绝、成功激活后查询工作在新数据上、旧库 .pre-restore 保留、二次恢复前清理残留（RED→GREEN）

## 5. 前端 UI

- [x] 5.1 `frontend/src/api/` 新增备份模块（配置读写/立即备份/历史/恢复向导接口）；数据库管理页新增「SQLite 备份」卡片：配置区（目标/间隔/保留份数/三个打包开关默认不勾选）、状态区（最近成功时间/下一轮预计）、历史列表、「立即备份」（未启用但配置完整时可用）
- [x] 5.2 恢复向导模态：临时目标输入 → 远端包列表（含版本差异提示、缺失 B 类段与 skipped 库明示）→ 选包校验进度 → **高危确认勾选** → 落位激活结果提示
- [x] 5.3 注册表无任何 SQLite 连接时卡片显示「不适用（无已注册的 SQLite 数据库）」；样式对齐数据库管理页既有卡片（根元素不加 padding，架构记忆 #99）；日期时间走 `utils/format.ts`（约定 #26）
- [x] 5.4 `npx vue-tsc -b` 通过；多语句 handler 提取为函数（约定 #25 教训）

## 6. 验证与收尾

- [x] 6.1 全量后端测试 `cd backend && uv run pytest`（全局隔离，约定 #30）
- [x] 6.2 PG 方言冒烟 `TEST_DB_BACKEND=pg uv run pytest tests/test_pg_dialect_smoke.py -q`（新表触及 schema，约定 #103）
- [x] 6.3 手工链路验证：连 12344/12345 实配一次到真实远端目录的备份 + 从备份恢复演练（含 .restored 激活与 .pre-restore 回退验证）（约定 #8：复用已运行实例，不启停服务）
- [x] 6.4 手工兜底恢复命令写入 `docs/design/sqlite-backup-dr.md` 附录（scp 拉包/解包/按 meta 原路径映射落位/.jwt_secret 权限收紧/重启）
- [x] 6.5 安全守卫/审计相关既有测试回归（`pytest -k "security or audit"`）
