# Design: sqlite-backup-dr

## Context

数据库管理模块（`app/api/v1/database.py` + `db_config.json` 活动连接机制）已有连接管理/切换/SSE 迁移/归档，但备份产物全部落本机盘。现场形态为多 SQLite 站点库（panshi.db + nanchang/shanghai 等）共存于 db_config 注册表；`features.yaml`/`clickhouse.yaml` 运行时被 UI 改写（与 git 跟踪内容漂移）；`inventory/host` 持有节点明文密码；`.jwt_secret` 同时是 JWT 签名密钥与 db_config 密码的 Fernet 密钥。完整背景与备份内容清单见 `docs/design/sqlite-backup-dr.md`（本设计的权威依据）。

## Goals / Non-Goals

**Goals:**
- db_config 注册的全部 SQLite 库的定时异地备份（分钟级 RPO），SSH 推送到另一台机器的目录
- 备份包携带换机所需完整环境（密钥/注册表/清单），新机同版本部署 + 一份备份包 = 环境等价恢复
- UI 可配置可观测（配置/历史/立即备份/恢复向导），注册表中无任何 SQLite 连接时明确不适用
- 安全纪律：密码不进 argv、Fernet 落库不回显、远端命令转义 + 文件名白名单、审计覆盖、安全守卫采样

**Non-Goals:**
- 秒级 RPO（WAL 流复制/Litestream）——无诉求，未来需要时叠加而非改造
- PostgreSQL 备份——自有体系
- 备份包静态加密、自动故障切换/热备常驻
- 应用代码/依赖打包——新机部署同版本平台是前提（meta.json 版本标识兜底提示）

## Decisions

1. **快照范围与失败语义**：对 db_config 注册的**每个 SQLite 连接**各自 `VACUUM INTO` 快照，**与活动连接类型无关**（active=PG 时站点库照常备份；「不适用」条件 = 注册表中无任何 SQLite 连接）。失败语义分层：**active 库文件缺失 → 整体失败**（平台本身有病，该报）；**非 active 注册库文件缺失/不可读 → 跳过该库并在 meta.json 记 skipped 清单**（避免一个失效遗留连接让全部备份永久失败）。未注册的垃圾库不打包。
2. **方案 A（应用内定时）而非 Litestream 边车/系统脚本**：RPO 分钟级足够；平台自包含（UI/审计/历史）；零外部依赖零分发负担。Litestream 有「切换活动库时边车不知情」的集成缝隙；系统脚本无管理面。对比表见设计文档第 2 节。
3. **推送复用 `ansible_service` SSH 模式 + 传输加固**：`sshpass -e` + 系统 ssh/scp，密码经 SSHPASS env 不进 argv；密钥认证无需 sshpass；日志审计脱敏沿用 `_mask_sshpass`。加固三点：上传用 `.part` 临时名、成功后 `ssh mv` 原子改名（防半截文件污染保留计数与列表）；**远端侧命令的路径/文件名参数一律 `shlex.quote`**（远端路径来自配置与恢复向导临时输入）；清理/列表只认白名单正则 `^panshi_backup_\d{8}_\d{6}\.tar\.gz$` 的文件（顺带防 ls 输出解析被畸形文件名干扰）。远端清理 = `ssh ls -1` 拉清单 → Python 算超保留量最旧份 → `ssh rm -f`（策略逻辑留本地可单测）。
4. **配置存库（`ps_db_backup_config` 单行 + `ps_db_backup_history`）而非 JSON 文件**：DR 恢复库时配置随库回来，新机恢复完成即自动续上备份节奏——闭合「配置文件在灾难中丢失」的鸡生蛋问题。新表走 create_all（约定 #119 仅新列需 COLUMN_MIGRATIONS）。配置校验：`interval_minutes ≥ 1`、`retain_count ≥ 1`。「立即备份」**不要求 enabled=true**，仅要求目标配置完整（允许只跑一次不开定时）。
5. **B 类数据目录（static / task-scripts / task-logs）为配置开关且默认 false**：数据库行引用它们但体积现场差异大，由用户在界面权衡勾选。恢复向导在选包时明示包内缺失的 B 类段（未勾选的段恢复后对应功能数据为空，避免误判数据丢失）。
6. **恢复激活策略（同名冲突的解法）**：db_switch 的语义是「改 active 指针指向另一个已存在的文件」，**不覆盖同名文件**——因此恢复的库一律落为 `<原名>.restored-<时间戳>`，再改 db_config 的 active 指向它 + 引擎重载（完全复用切换机制，并自然继承 database-management 既有需求「存在运行中任务时禁止切换」）。旧库文件保留为 `.pre-restore-<时间戳>` 作回退；每次恢复前清理旧 `.restored-*` 残留。落位顺序固定：**key 文件（.jwt_secret/.env.*）先落（600 权限）、库文件后落、引擎最后重载**——保证重载后的解密/连接全部使用包内自洽状态。
7. **权限复用 `database_management` 键**：备份属数据库管理域，避免新权限项的前端双端注册负担。
8. **调度与三类长任务互斥**：lifespan 后台循环（`_relay_refresh_loop` 同款）30s 检查 `enabled && 到期` 触发；阻塞 IO 走 `asyncio.to_thread`；备份/恢复共用 in-flight 互斥标志（任一进行中，另一操作被拒/推迟）；**迁移运行中（复用 `maintenance._migration_lock` 判定）调度跳过**（避免快照到迁移中间态库）；备份全程不持数据库事务（约定 #29——避免审计骨架写锁横跨 SSH IO 引发假 401）。启用/保存配置后 30s 内即触发首次备份（隐含行为显式化）。
9. **包布局与路径映射**：databases/ 段**按连接 id 平铺命名**，meta.json 记录每个库的**原路径**（相对或绝对），恢复按 meta 原路径落位——同时解决「非 data/ 相对路径的层级保持」与 `../../` 路径穿越两个问题。`.env.*` 打包**全部存在文件**（不猜 APP_ENV，消除判定歧义）。
10. **版本标识尽力而为**：meta 记录 pyproject version + 部署目录存在 .git 时附 commit hash（皆不可得记 unknown）；恢复时版本比较尽力而为——不可比则不提示不阻断。平台建立真实版本体系后自然增强。

## Risks / Trade-offs

- [备份包含明文密码与密钥，泄露即全面失守] → 传输仅走 SSH 加密通道；文档要求远端目录 700/属主备份账号；恢复后 `.jwt_secret`/`.env.*` 落位 600；不做静态加密（密钥管理引入的新问题大于收益，明确接受）
- [`.jwt_secret` 丢失导致 db_config 密码不可解] → 列入 A 类必打包项并在恢复校验中检查其存在性；设计文档标注为「最易漏的致命项」
- [恢复覆盖本机数据是不可逆高危操作] → 向导最后一步强制勾选「我了解恢复将覆盖本机数据库与配置文件」（仿迁移导入 confirmed_clear 先例）；旧库保留 `.pre-restore-<ts>` 可手工回退
- [Fernet key 进程内缓存导致恢复后解密失败] → 实现时确认 security/db_config 的 key 读取无模块级缓存；若有缓存则提供失效机制（落位顺序已保证 key 先于引擎重载）
- [恢复后活动库文件名带 .restored 后缀] → 运维认知成本；恢复前清理旧 restored 残留 + 文档说明；换取不重启、可回退的安全性
- [RPO = 备份间隔，间隔内变更丢失] → 用户已确认分钟级可接受；间隔可配（默认 5 分钟，最小 1 分钟）
- [远端目录不可达/磁盘满致备份失败] → 失败写历史（状态/错误信息）并在 UI 状态区可见；不重试风暴——下一调度周期自然重试
- [恢复列表中的包在下载前被远端清理] → 下载前校验存在性，不存在则提示刷新列表
- [新机部署版本与备份版本不符] → 版本比较尽力而为（Decision 10），可提示时提示
- [sshpass 未安装且密码认证] → 复用既有检测与中文提示格式（同 `ansible_service`）

## Migration Plan

- 纯新增（两张新表由 create_all 自动建），无存量数据迁移；不启用开关则行为零变化
- 回滚 = 界面关闭启用开关；代码回退无数据残留风险（历史表数据无害）
