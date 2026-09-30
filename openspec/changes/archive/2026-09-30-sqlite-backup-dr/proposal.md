# Proposal: sqlite-backup-dr

## Why

数据库管理模块的全部备份产物（迁移前备份、B2 归档）都落在本机盘——机器故障即全部丢失，无法在另一台机器上恢复平台运行环境。SQLite 场景（现场的实际形态）缺少异地备份与换机容灾能力；PostgreSQL 自有主备体系，不在本变更范围。

## What Changes

- 新增 **SQLite 定时异地备份**：后台调度（lifespan 循环，默认 5 分钟、可配、最小 1 分钟）对 db_config 注册的**全部 SQLite 连接库**（与活动连接类型无关）执行 `VACUUM INTO` 在线快照，与环境配置文件（db_config.json / .jwt_secret / 全部 .env.* / features.yaml / clickhouse.yaml / ansible 清单）打包为 tar.gz，经 SSH 推送到远端机器目录（复用 sshpass/密钥模式，密码只走环境变量，`.part` 临时名 + 原子改名防半截文件），远端按保留份数清理最旧备份；注册表中无任何 SQLite 连接时功能显示「不适用」
- 新增 **备份配置与历史**：`ps_db_backup_config` 单行配置表 + `ps_db_backup_history` 历史表；配置存库使 DR 恢复后自动续上备份节奏；B 类数据目录（static / task-scripts / task-logs）为界面开关，**默认不勾选**
- 新增 **换机恢复向导**：新机部署同版本平台后，「从备份恢复」临时输入远端目标 → 列远端备份包 → 下载校验（SHA256 + SQLite integrity_check + 关键表存在性）→ 高危确认勾选 → 落位（恢复库以 `.restored-<ts>` 后缀落盘、经现有活动库切换机制激活，不热替换正在使用的文件；旧库保留 `.pre-restore-<ts>` 可回退）
- 新增 **「SQLite 备份」UI 卡片**：挂在数据库管理页；活动库为 PostgreSQL 时显示「不适用」并跳过调度
- 权限复用 `database_management` 键（不新增权限项）；配置变更/手动备份/恢复走审计；新增端点补进 `test_security_guard.py` 采样

## Capabilities

### New Capabilities

- `sqlite-remote-backup`: SQLite 定时快照打包与 SSH 异地推送——调度触发（与迁移/恢复互斥）、快照范围与失败/跳过语义、包结构与内容清单（A 类必含 / B 类开关默认关 / C 类排除）、远端保留清理与传输安全（原子改名、命令转义、文件名白名单）、备份历史记录、配置模型与密码加密存储
- `sqlite-backup-restore`: 换机容灾恢复向导——临时目标输入（不依赖已存配置）、远端备份列表（含缺失段/skipped 库明示）、完整性校验、高危确认、经活动库切换机制落位激活（.restored 后缀 + 回退保留）、手工兜底路径

### Modified Capabilities

（无——`database-management` 既有需求不变，备份卡片为新能力自带需求）

## Impact

- **后端**：新增 `app/services/db_backup_service.py`（快照/打包/推送/清理/恢复）、`app/api/v1/db_backup.py`（配置 CRUD、立即备份、历史、远端列表、恢复）、`app/models/db_backup.py`（两张新表，create_all 自动建表）；`main.py` lifespan 新增备份调度循环
- **前端**：数据库管理页新增「SQLite 备份」卡片（配置/状态/历史/立即备份/恢复向导模态）
- **依赖**：无新增 Python/前端依赖（SSH 复用 sshpass + 系统 ssh/scp；密码加密复用 db_config Fernet 密钥链）
- **安全**：备份包含明文 SSH 密码与 JWT/Fernet 密钥，属高敏感物——传输走 SSH 加密通道，远端目录要求 700；备份目标密码 Fernet 加密落库、API 不回显明文
- **测试**：TDD 新增服务/API/调度/恢复用例；`test_security_guard.py` 补采样；合入前跑 PG 方言冒烟（新增表触及 schema）
- **设计文档**：`docs/design/sqlite-backup-dr.md`（本变更的完整设计依据）
