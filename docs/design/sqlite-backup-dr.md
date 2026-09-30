# SQLite 异地备份与容灾恢复设计

> 状态：设计讨论稿（待评审）
> 日期：2026-09-30
> 修订：2026-09-30 增补备份包来源标识（openspec `db-backup-source-tag`：命名 / 保留清理 / 恢复继承）
> 关联模块：数据库管理（`backend/app/api/v1/database.py`）、`db_config`、`features.yaml`、Ansible 清单

## 1. 背景与目标

数据库管理模块已具备连接管理、活动库切换、SSE 迁移、B2 归档导出、迁移历史等能力，但所有备份产物（迁移前备份 `./data/backups/`、归档 `./data/archives/`）都落在本机盘——**机器一挂全没**。

本设计补齐 SQLite 场景下的异地备份与换机容灾：

- **备份到别处**（不是本机）：定时生成快照包，SSH 推送到远端机器目录
- **容灾恢复**：本机故障后，在另一台机器拉起平台，数据与环境不丢失（丢失窗口可控）
- **范围**：仅 SQLite。PG 自有主备/备份体系，不在本设计内；注册表中无任何 SQLite 连接时备份功能显示「不适用」并跳过调度（active 为 PG 不影响站点库备份）

### 需求决策记录

| 决策点 | 结论 |
|---|---|
| RPO | 丢最近几分钟的配置变更可接受（分钟级） |
| 推送通道 | SSH 推送（目标机只需 sshd，与节点管理 SSH 模式一致） |
| 备份数据类文件（static/task-scripts/task-logs） | 界面开关由用户选择，**默认全部不勾选** |
| 恢复形态 | UI 辅助恢复（换机后新装平台从远端拉备份） |

## 2. 方案选型

| 方案 | 机制 | RPO | 优 | 劣 | 结论 |
|---|---|---|---|---|---|
| **A. 应用内定时快照 + SSH 推送** | `VACUUM INTO` 快照 → tar.gz → scp 推远端 | 分钟级（= 备份间隔） | 平台自包含、UI 可管理可观测、零外部依赖 | 平台内新增 service+定时器+UI | **采用** |
| B. Litestream 边车 | WAL 页持续流复制到 S3/SFTP | 秒级 | 应用零改动 | 外部二进制（国内网络分发难）+ 新 systemd 单元；「切换活动库」时边车不知情的集成缝隙；观测不在平台内 | 不采用（RPO 无秒级诉求） |
| C. 系统级定时脚本 | systemd timer + `sqlite3 .backup` + rsync | 分钟级 | 半小时落地 | 不在 UI 内、配置散落、无平台观测审计 | 不采用（A 的运维化退化版） |

## 3. 备份内容清单（新机环境一致性盘点）

原则：**打包一切「运行时会漂移、丢失后环境改变」的文件；排除可再生与随代码部署的文件**。前提假设：新机器先部署**同版本**平台代码（备份包恢复的是数据+配置，不含应用代码）。

### A 类：必须打包（密钥/注册表/清单）

| 文件/目录 | 作用 | 关键说明 |
|---|---|---|
| `backend/db_config.json` | 数据库连接注册表 + active 指针 | 密码为 Fernet 加密存储 |
| `backend/data/.jwt_secret` | JWT 密钥（开发自动生成路径） | ⚠️ **最易漏的致命项**：同一把 key 也是 `db_config.json` 密码的 Fernet 解密密钥。丢失后果：所有用户 token 失效（可接受）+ **db_config 中全部加密密码无法解密**（不可接受，PG/CK 连接全断） |
| `backend/.env.<APP_ENV>` | 生产 JWT_SECRET_KEY、EDGE_SM4_KEY、EDGE_ADMIN_KEY | `edge_client` / `edge_import_service` / `edge_logger` 依赖 EDGE keys；文件存在即打包（与 `.jwt_secret` 可能并存） |
| `backend/features.yaml` | 功能开关（relay_gateway 等） | ⚠️ 虽然 git 跟踪，但**运行时被 UI 改写 + mtime 热加载**——生产机内容必然与仓库默认值漂移，新机 clone 仓库拿到的是默认配置 |
| `backend/clickhouse.yaml` | ClickHouse 连接配置 | 同上，「系统管理 → ClickHouse 配置」页直接写它 |
| `backend/ansible/inventory/host` | 节点 SSH 清单（**明文密码**，约定 #10 不脱敏） | `.gitignore` 明确排除的运行时状态；节点管理/自启动/节点任务/中继跳板全依赖 |
| `backend/ansible/inventory/backups/` | 清单密码历史备份 | 清单误写时的安全网，体积小，随包 |
| `backend/ansible/group_vars/` | ansible 组变量（运行时读取 ssh 用户/密码） | 防手工维护漂移，体积小，随包 |
| `data/` 下 **db_config 注册的全部 SQLite 库** | 活动库 + 站点库（如 nanchang/shanghai） | 各自 `VACUUM INTO` 产生干净快照（不含 -wal/-shm）；**未注册的库文件不打包**（test.db、sample.db、old/ 等垃圾） |

### B 类：界面开关，默认不勾选（数据库行引用的运行时数据）

| 目录 | 引用方 | 默认 |
|---|---|---|
| `backend/data/static/` | 静态资源发布（`data/static/<edge_uuid>/`） | 不打包（丢失则静态资源发布失效，由用户权衡体积后勾选） |
| `backend/data/task-scripts/` | 节点任务上传/留档脚本 | 不打包 |
| `backend/data/task-logs/` | 节点任务执行日志（DB 行存相对路径） | 不打包（持续增长） |

### C 类：不打包（可再生/随代码部署）

- `data/archives/`、`data/backups/`（迁移/归档产物，可再生）
- `ansible/artifacts/`（ansible-runner 运行输出）、`ansible/env/`（runner 模板，repo）
- `logs/`、`uvicorn.err|out`、`.port`、`.pid`、`/tmp/panshi-cp/`（SSH ControlPath sockets）
- 应用代码、playbooks、roles、`app/config/equivalence_rules.yaml`（运行时只读）、`plugin_definitions.py`

## 4. 备份包结构

```
panshi_backup_{source}_YYYYMMDD_HHMMSS.tar.gz   # 时间戳为 Asia/Shanghai（运维可读）；source = 来源标识
├── meta.json        # app 版本标识（pyproject version + 可得时 git commit，否则 unknown）、备份时间（UTC）、active 连接 id、来源标识、文件清单 + SHA256、各库原路径与 skipped 清单
├── databases/       # db_config 注册的 SQLite 库快照，按连接 id 平铺命名（原路径记于 meta，恢复按原路径落位）
│   ├── <conn_id_a>.db
│   ├── <conn_id_b>.db
│   └── ...
├── config/          # db_config.json / features.yaml / clickhouse.yaml / .jwt_secret / 全部存在的 .env.*
├── ansible/         # inventory/host、inventory/backups/、group_vars/
└── data/            # 仅勾选的开关项：static/、task-scripts/、task-logs/
```

### 来源标识（source）与命名

- **命名格式**：`panshi_backup_{source}_{YYYYMMDD_HHMMSS}.tar.gz`。多套平台实例共享同一远端目录时包名不冲突（同秒互不覆盖），保留清理只老化自己的包，恢复列表可辨识来源。升级前的旧格式 `panshi_backup_{YYYYMMDD_HHMMSS}.tar.gz` 在新代码下继续可见、可恢复、可自然老化（不回填/不重命名远端旧包）。
- **组合白名单正则**（单点定义于 `db_backup_service.PACKAGE_NAME_RE`，恢复侧 `db_restore_service` 复用，禁止两处硬编码各自演化）：`^(?:panshi_backup_[A-Za-z0-9._-]+_\d{8}_\d{6}|panshi_backup_\d{8}_\d{6})\.tar\.gz$`——同时接受新格式与旧格式，拒绝 `.part` 残留与无关文件。两分支不相交且拆分唯一：时间戳后缀恰占尾部 15 字符，source 随之唯一确定（source 含内嵌 `_数字_数字` 或纯数字也不产生歧义）。
- **source 取值**：可配置（`ps_db_backup_config.source_name`）；**空值时一次性自动解析并持久化**——探测顺序：出口 IP（UDP `connect` 到备份目标 host:port，不发真实流量）→ `socket.gethostname()` → 兜底常量 `panshi`。两个触发点：① 配置保存时载荷空（含「清空字段重存」的补救路径）；② 存量 NULL 首次备份时。**备份执行只读存储值，绝不每次动态探测**（IP 漂移后清理认不出自己的旧包会永久堆积）。IPv6 地址含 `:` 不在白名单，清洗为确定性变形（如 `fe80::1` → `fe80--1`）；IPv6 环境建议显式配置。
- **配置保存校验正则**：`^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`（首字符字母/数字、总长 ≤64；拒绝 `/`、空白、引号、`..`/`-x` 开头）；空串与未提供等同「未填 → 自动解析」。解析结果在持久化前做防御性清洗（非法字符替换 `-`、超长截断、去前导非字母数字字符），保证满足校验正则。

- `meta.json` 记录 app 版本标识（尽力而为）：新机部署版本低于备份版本且可比时给出明确提示（不阻断，由运维判断；不可比则不提示）；`meta.source` 仅作核对——**文件名解析是来源标识的唯一事实来源**（排序 / 保留清理 / 列表展示同源），与文件名不一致时恢复列表标注「包被改名过」
- 每个文件带 SHA256，恢复时完整性校验
- **非 active 注册库文件缺失/不可读 → 跳过并记入 meta.skipped**（避免一个失效遗留连接让全部备份永久失败）；active 库缺失则整体失败

## 5. 备份流水线（每次触发）

1. **前置检查**：注册表中存在 SQLite 连接（**与 active 类型无关**——active=PG 时站点库照常备份；「不适用」= 注册表中无任何 SQLite 连接）；无进行中的备份/恢复任务（共用互斥防重入）；数据库迁移运行中跳过（避免快照迁移中间态）；**至少一个启用位置**（手动备份无启用位置报 422/明确错误；调度无启用位置跳过）
2. **来源标识解析**：一次性解析持久化语义不变（见第 4 节）；多目标下出口 IP 探测方向 = **第一个启用位置**（D8：与主恢复路径一致），无启用位置时 hostname → 兜底
3. **快照**：对 db_config 注册的每个 SQLite 库执行 `VACUUM INTO` 临时文件——在线、一致、对运行中 WAL 库安全，顺带碎片整理；active 库快照失败或文件缺失则整体失败，非 active 库缺失则跳过并记 meta.skipped（保证包完整性的同时不被遗留失效注册拖死）
4. **打包（一次）**：按第 4 节结构组装 tar.gz，同时生成 `meta.json`（文件清单 + SHA256）。**包只构建一次**，与位置数无关（内容/频率/来源标识全局一致，设计决策：不做按位置差异化内容——保留窗口靠各位置 retain_count 表达）
5. **扇出推送**（逐启用位置按 id 序串行，复用 `ansible_service` 的 SSH 模式）：
   - 每位置：`sshpass -e ssh mkdir -p <远端目录>` → 以 **`.part` 临时名 scp 上传 → `ssh mv` 原子改名**（防半截文件污染保留计数与列表）→ **该位置自己的 retain_count 保留清理**（见下）
   - **单位置失败记录子结果后继续下一位置**（不中断整体）；每位置记 `ps_db_backup_history_target` 子结果行（target_name 快照 + status/error/duration_ms）
   - 密码认证：密码经 `SSHPASS` 环境变量传递，**绝不进 argv**（防 `/proc/<pid>/cmdline` 泄露）；`sshpass` 未安装时报既有格式的明确提示（同 `ansible_service._sshpass_available`）
   - 密钥认证：无需 sshpass，直接 ssh/scp
   - 日志与审计中的命令脱敏沿用 `_mask_sshpass` 正则；**远端侧命令的路径/文件名参数一律 `shlex.quote` 转义**
6. **保留清理（按源过滤、按位置独立）**：`ssh ls -1` 拉取该位置远端清单 → 组合白名单正则过滤（见第 4 节，`.part` 残留不计入）→ **候选集 =「来源标识等于本机的包 ∪ 旧格式包」** → 按包名中的时间戳倒序保留该位置的 `retain_count` 份、删除更旧（`ssh rm -f`；清理策略留在本地代码，便于单元测试）。**绝不删除来源标识不同的新格式包**（可能是别机命脉），也不计入保留份数；旧格式包归入清理集是为了自然老化（否则升级前本机产物永久堆积）——共享目录下多实例可竞争删 legacy，属有界过渡态，legacy 耗尽后收敛
7. **落史（三态）**：主记录 `ps_db_backup_history` 状态 = 全部启用位置成功 `success` / 部分 `partial` / 全败或构建失败 `failed`；`last_success_at` **仅全绿更新**（「距上次完整成功」指标）；error 汇总逐目标拼接（`位置名: 错误`）；**构建阶段失败或无启用位置 = failed 且无子结果行**（推送未发生）

## 6. 调度

- `main.py` lifespan 起后台循环（`_relay_refresh_loop` 同款模式）：每 30s 检查 `enabled && now - last_success >= interval_minutes` 则触发；**启用/保存配置后 30s 内即触发首次备份**
- 备份间隔最小 1 分钟，界面可配置（默认 5 分钟）、保留份数默认 7（两者校验 ≥ 1）
- **无启用位置时调度跳过**（界面显示「未配置启用的备份位置」不适用态，不报错不落史）
- **三类长任务互斥**：备份与恢复共用 in-flight 标志（任一进行中另一操作被拒/推迟）；迁移运行中（`maintenance._migration_lock` 判定）调度跳过
- SSH/压缩等阻塞 IO 走 `asyncio.to_thread`，不阻塞事件循环
- **事务纪律（约定 #29 教训）**：配置读取、历史落库各自短事务；快照/推送期间不持有任何数据库事务
- 另提供「立即备份」按钮（触发来源记 manual；**不要求 enabled，但要求至少一个启用位置**——允许只跑一次不开定时）

## 7. 配置模型（两层）

**全局层 `ps_db_backup_config`（单行）**：`enabled` / `interval_minutes` / `source_name`（来源标识，String(64)，NULL = 未解析）/ `include_static` / `include_task_scripts` / `include_task_logs`（三开关默认 false）/ `last_run_at` / `last_success_at` / `last_status`（success|partial|failed）/ `last_error` / `targets_migrated`（存量迁移标志）

**位置层 `ps_db_backup_target`（多行，name 全库唯一）**：`name`（仅下拉与历史快照展示，不进文件名与 shell 命令；允许中文，拒 `/ \ : * ? " < > |` 与控制字符、首尾无空白、≤64 字符）/ `host` / `port` / `username` / `auth_type`(password|key) / `password_encrypted`（Fernet，复用 db_config 的密钥链，即 JWT secret）/ `key_path` / `remote_dir` / `retain_count`（≥1，**按位置差异化**：局内短保留快恢复、中心长保留防勒索）/ `enabled` / 时间戳

**子结果层 `ps_db_backup_history_target`**：`history_id`（FK）/ `target_id`（**不设 FK 强制**，位置删除后悬挂无妨）/ `target_name`（快照）/ `status` / `error` / `duration_ms`；仅推送阶段产生

- **保留窗口时间跨度 = 保留份数 × 备份间隔**（各位置独立计算：局内 7 份 × 5 分钟 ≈ 35 分钟快恢复；中心 30 份 × 5 分钟 = 2.5 小时防勒索；拉长窗口调间隔而非份数，避免列包与清理开销线性膨胀）
- `source_name` 的解析与校验见第 4 节「来源标识（source）与命名」
- 用户中途改 `source_name` 的后果：旧 source 的包变"他人"→ 本机不再清删（**搁浅**），需手工清理；多机共享目录时建议显式固定标识、各机唯一
- **存量迁移（`ensure_targets_migrated`）**：启动 lifespan + `GET /config` 首读双保险触发；标志假 且 旧 `host` 非空 → 复制全部旧目标字段建 `name='default'` 的位置（enabled=True）并置位标志；幂等（标志置位后不再触发，**删光位置后重启不复活**）；并发兜底靠 name 唯一约束（冲突回滚重查认领）
- **回滚语义**：旧目标列（host/port/username/...）**保留不删**（迁移源 + 回滚到旧版代码仍可按单目标跑）；多目标代码不再读写这些列（仅 GET /config 回显存量值）
- `ps_db_backup_history`：`started_at` / `finished_at` / `status`（三态）/ `file_size` / `duration_ms` / `error` / `trigger`
- **配置存库而非 JSON 文件的用意**：DR 恢复数据时配置随库一起回来，新机器恢复完成即自动续上备份节奏
- 新表由 `create_all` 自动建表（约定 #119：仅新列需走 COLUMN_MIGRATIONS——`source_name`、`targets_migrated` 均已登记；新表不需要）

## 8. 恢复流程（换机容灾）

**场景**：原机器故障；新机器已部署同版本平台（空库 + seed admin，可登录）。

1. 「备份管理（独立页面）→ 从备份恢复」打开恢复向导
2. **目标来源三选**（与手输二选一，`target_id` 与手输参数互斥）：
   - 选择已配置位置（下拉，按 `target_id` 列包）；
   - **聚合视图**（默认，不传任何参数）：聚合**全部已配置位置（含停用）**——逐位置列包、按包名去重合并、行标注存在位置（`present_in`）、某位置不可达标注失败不阻断；无已配置位置返回空列表 + 提示走手输；
   - 临时输入远端目标（主机/端口/用户/密码或密钥/远端目录）——新机配置表是空的，恢复不依赖已存配置
3. 列出远端备份包（`ssh ls` 组合白名单过滤、忽略 `.part` 残留，**按包名中解析出的备份时间戳倒序**——混合来源下文件名字典序不再等价时间序；展示各包**来源标识**（文件名解析为唯一事实来源，旧格式包显示为未知；meta.source 与文件名不一致时标注包被改名过）与 meta 摘要：备份时间/app 版本/体积/skipped 库/未包含的 B 类段——**缺失段明示，避免误判数据丢失**）；版本可比且低于备份包时提示（不可比不提示）；下载前校验文件仍存在
4. 选定一份 → 下载到本地临时目录 → 校验（tar 完整性 + SHA256 逐文件 + SQLite `PRAGMA integrity_check` + 关键表存在性）
5. **高危确认**：勾选「我了解恢复将覆盖本机数据库与配置文件」（仿迁移导入 confirmed_clear 先例）
6. 校验与确认通过后按固定顺序落位：
   - **key 文件先落**：`.jwt_secret`、`.env.*`（权限 600）——保证后续引擎重载后的解密使用包内自洽状态
   - 库文件按 meta 记录的各库原路径，落为 `<原名>.restored-<时间戳>`（不与运行中的文件同名冲突）
   - `config/`、`ansible/`、`data/` 各文件落回原位
   - 清理历史 `.restored-*` 残留 → 旧活动库改名 `.pre-restore-<时间戳>`（保留回退能力）→ 改 db_config 的 active 指向恢复库 → 经**现有活动库切换机制**（引擎重载）激活——**绝不热替换正在使用的文件**，并继承「存在运行中任务时禁止切换」语义
7. 引擎重载后提示「恢复完成」，页面刷新即工作在恢复后的数据上；**恢复的备份配置含来源标识时，完成提示附带来源标识检查提醒**（显示继承的标识值；共享目录双跑场景需人工修改，避免两机同标识互删）

**来源标识继承（容灾恢复的默认行为）**：恢复落位把站点库整库恢复，`ps_db_backup_config` 行（含 `source_name`）随包恢复 → **新机继承旧机标识**。真 DR（旧机已废）时这是优点：旧机的包被新机视为己方 source，保留清理连续、不搁浅不堆积；双跑/迁移（旧机还活着）时两机同 source 会退化互删语义——恢复完成后按提示检查并人工修改。

**兜底（无 UI 的手工路径）**：文档提供等价手工命令（scp 拉包 → 解包 → 按 meta.json 原路径映射落位各库 → `.jwt_secret`/`.env.*` 收紧 600 → 重启平台），供 UI 不可用时使用。

## 9. 安全考量

- **备份包是高敏感物**：内含明文 SSH 密码（inventory）、JWT/Fernet 密钥、CK/PG 连接密码
  - 传输走 SSH 加密通道（内网可接受；如需静态加密可后续评估包级加密，暂不做——密钥管理反而引入新问题）
  - 文档明确要求：**远端目录权限 700、属主为备份专用账号**；恢复后 `.jwt_secret` / `.env.*` 权限 600
  - 沿用约定 #10：清单密码不脱敏，备份必须保真
- 备份目标密码在库中 Fernet 加密（复用 db_config 密钥链）；API 响应中密码不回显明文
- SSH 命令构造遵循 `ansible_service` 既有纪律：密码走 `SSHPASS` env、日志/审计脱敏、StrictHostKeyChecking 与既有 SSH 选项保持一致

## 10. 权限与审计

- 权限复用 `database_management` 键（备份属数据库管理域，**不新增权限项**，避免前端权限键双端注册负担）
- 全部端点挂鉴权；**新增端点补进 `tests/test_security_guard.py` 的 UNAUTHENTICATED_SAMPLES**（约定 #19 教训）
- 配置变更、手动备份、恢复操作走 `log_audit` 审计

## 11. UI 概要

**独立页面「备份管理」**（多目标化升级，db-backup-multi-target）：

- **全局配置区**：启用开关、备份间隔、来源标识（空 = 自动解析）、B 类三个打包开关（默认不勾选）
- **位置管理区**：位置列表（名称/主机/认证/远端目录/保留份数/启用状态）+ 增删改抽屉 + 按载荷测连（可先于保存）；名称允许中文
- **状态摘要区**：最近一次备份时间/三态状态/体积，下一轮预计时间；`last_success_at` 仅全绿更新（「距上次完整成功」）
- 操作区：「立即备份」按钮、「备份历史」列表（时间/三态状态/体积/耗时/触发来源/**每位置子结果**/错误信息）
- 「从备份恢复」入口（模态向导，第 8 节流程）
- 注册表中无任何 SQLite 连接、或无启用位置时显示「不适用」；active 为 PG 不影响站点库备份
- 数据库管理页保留**摘要卡**（只读状态 + 跳转入口），完整操作在独立页面
- 样式对齐既有页面卡片（根元素不加 padding，约定见架构记忆 #99）

## 12. 测试计划（TDD，先 RED 后 GREEN）

- **快照**：临时 SQLite（WAL 模式 + 并发写入）上 `VACUUM INTO` 一致性；多库注册时逐库快照；未注册垃圾库不进包
- **打包**：包结构、meta.json 清单与 SHA256 正确性；B 类开关开/关时 data/ 内容变化
- **推送**：mock subprocess 断言——密码只出现在 env 不在 argv；sshpass 缺失时错误提示；远端清理按 retain_count 删最旧
- **恢复**：损坏包/校验失败拒绝落位；成功恢复后活动库切换生效
- **调度**：间隔到期触发、in-flight 防重入（备份/恢复共用互斥）、迁移运行中跳过、注册表无 SQLite 连接跳过、启用后 30s 内首备
- **安全**：`test_security_guard.py` 补采样；密码 API 不回显
- **PG 方言冒烟**：新增两张表触及 schema → 合入前 `TEST_DB_BACKEND=pg uv run pytest tests/test_pg_dialect_smoke.py`（约定 #103）

## 13. 边界与明确不做的事

- 不做备份包静态加密（密钥管理引入的新问题大于收益，内网 SSH 通道可接受；如需再评估）
- 不做 WAL 流式秒级 RPO（无诉求；若未来需要，叠加 Litestream 而非改造本方案）
- 不备份 PostgreSQL 库（自有体系）；但 active=PG **不影响**注册的 SQLite 站点库照常备份
- 不在备份包内携带应用代码/依赖（新机部署同版本平台是前提，meta 版本标识尽力而为兜底提示）
- 不做自动故障切换/热备常驻（恢复是人工触发的向导流程；热备机可作为后续运营实践，不进代码）

## 13a. 风险与运维注意（来源标识相关）

- **回滚到旧版代码**：新格式包不匹配旧白名单正则 → 旧代码列表不可见、清理不管 → 永久堆积。回滚操作手册须注明**手工删除新格式文件**（接受：回滚是罕见路径；还原代码即可，`source_name` 列残留无害）。**多目标回滚**：位置表与 `targets_migrated` 列残留无害——旧代码不读写；旧目标列未清空，回滚后按单目标语义继续跑（备份继续可用；期间新格式包在位置目录中继续堆积，同样需手工清理）
- **两实例配了相同 source_name**（或自动解析全链路失败双双落兜底常量 `panshi`）：退化为现状语义（时间戳区分、秒级撞名覆盖仍在）。共享目录必须各机配不同标识；表单/文档提示
- **改 source_name 搁浅旧包**：换机/换 IP 重新解析、或人工改名后，旧 source 的包变"他人"→ 本机不再清删。缓解：一次性解析持久化 + 表单提示；搁浅包手工清理
- **删除位置搁浅远端包**：删除位置只删配置行，**不清理其远端目录**（无从确认目录是否他机共用）；子结果行靠 `target_name` 快照保留展示（`target_id` 悬挂无妨）。需彻底清理时手工删除远端目录或先清包再删位置
- **扇出串行推送耗时**：位置按 id 序串行推送，N 个位置 ≈ N 倍单位置推送时间；单位置失败不中断但也拉长整体时长（每位置独立超时）。位置数大且间隔短时注意调度重叠（in-flight 互斥会顺延，不会并发跑两份）
- **过渡期 legacy 竞争删除**：共享目录多实例都可删旧格式包。有界（legacy 终将耗尽）、不劣化于升级前的全局排序现状
- **恢复继承后双跑**：恢复落位继承旧机 source_name，旧机仍在运行时两机同 source 互删回归。缓解：恢复完成提示检查来源标识（显示继承值）；真 DR 场景继承是正确行为

## 14. 附录：手工兜底恢复命令（平台不可用时）

适用场景：新机/灾备机上平台进程无法启动，或希望完全手工落位。前提：目标机已部署**同版本**平台代码，SSH 凭据可访问备份远端目录。

```bash
# 0) 变量（按实际替换）
REMOTE=backup@dr-host:/srv/panshi-dr          # 备份远端目标
PKG=panshi_backup_192.168.0.5_20260930_103000.tar.gz  # 选定的备份包（白名单命名；新格式含来源标识，旧格式 panshi_backup_20260930_103000.tar.gz 同样可恢复）
BACKEND=/opt/panshi/backend                   # 目标机平台 backend 目录
WORK=/tmp/panshi-manual-restore && mkdir -p "$WORK"

# 1) 拉包并核对（存在性 → 下载 → 完整性）
ssh backup@dr-host "test -f /srv/panshi-dr/$PKG" || { echo "包不存在，请到远端 ls 确认"; exit 1; }
scp "$REMOTE/$PKG" "$WORK/" && cd "$WORK"
gzip -t "$PKG"                                   # gzip 完整性
tar -xzf "$PKG" -C "$WORK"                       # 解包（tar 报错即拒绝使用）
python3 - <<'PY'                                 # 逐文件 SHA256 比对 meta 清单
import hashlib, json, pathlib
w = pathlib.Path("/tmp/panshi-manual-restore")
meta = json.loads((w / "meta.json").read_text(encoding="utf-8"))
for rel, info in meta["files"].items():
    p = w / rel
    assert p.stat().st_size == info["size"], f"大小不符: {rel}"
    assert hashlib.sha256(p.read_bytes()).hexdigest() == info["sha256"], f"SHA256 不符: {rel}"
print("SHA256 全部通过")
PY

# 2) 每库关键表自检（databases/ 下每个 .db 都应含核心表）
for db in "$WORK"/databases/*.db; do
  sqlite3 "$db" "PRAGMA integrity_check;"                          # 期望 ok
  sqlite3 "$db" "SELECT count(*) FROM sys_user; SELECT count(*) FROM ps_cluster;"
done

# 3) 落位 key 文件（权限 600；.jwt_secret 位于 backend/data/）
install -m 600 "$WORK/config/.jwt_secret" "$BACKEND/data/.jwt_secret"
for f in "$WORK"/config/.env.*; do install -m 600 "$f" "$BACKEND/$(basename "$f")"; done
# 配置/清单（db_config.json/features.yaml/clickhouse.yaml）
cp "$WORK/config/db_config.json" "$BACKEND/db_config.json" 2>/dev/null || true
cp "$WORK/config/features.yaml" "$BACKEND/app/config/features.yaml" 2>/dev/null || true
cp "$WORK/config/clickhouse.yaml" "$BACKEND/app/config/clickhouse.yaml" 2>/dev/null || true

# 4) 库文件落位：按 meta.json 的 databases 段「连接 id → original_path」映射，
#    落为 <原名>.restored-<时间戳>，并清理旧 .restored-* 残留
TS=$(date -u +%Y%m%d_%H%M%S)
python3 - <<PY
import json, pathlib, shutil, time
w = pathlib.Path("/tmp/panshi-manual-restore")
meta = json.loads((w / "meta.json").read_text(encoding="utf-8"))
backend = pathlib.Path("$BACKEND")
ts = "$TS"
for conn_id, db_meta in meta["databases"].items():
    src = w / "databases" / f"{conn_id}.db"
    orig = backend / db_meta["original_path"].lstrip("./")          # 相对 backend/ 解析
    for stale in orig.parent.glob(orig.name + ".restored-*"):
        stale.unlink()
    dest = orig.parent / f"{orig.name}.restored-{ts}"
    orig.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)
    print(f"{conn_id}: {dest}")
PY

# 5) 旧活动库保留 + registry 指向恢复库
#    active 连接 id 见 meta.json 的 active_connection_id 字段；
#    旧活动库改名保留（回退用）：
#      mv "$BACKEND/data/panshi.db" "$BACKEND/data/panshi.db.pre-restore-$TS"
#    再把 backend/db_config.json 中各 SQLite 连接的 path 改为对应的 .restored-<TS> 路径
#    （active 连接的 path 必改；建议同批全部对齐）
python3 - <<PY
import json, pathlib
backend = pathlib.Path("$BACKEND")
reg = json.loads((backend / "db_config.json").read_text(encoding="utf-8"))
meta = json.loads(pathlib.Path("/tmp/panshi-manual-restore/meta.json").read_text(encoding="utf-8"))
ts = "$TS"
for conn in reg.get("connections", []):
    if conn.get("type") != "sqlite":
        continue
    for conn_id, db_meta in meta["databases"].items():
        if conn_id == conn["id"]:
            old = (backend / db_meta["original_path"].lstrip("./"))
            conn["path"] = str((old.parent / f"{old.name}.restored-{ts}"))
(backend / "db_config.json").write_text(json.dumps(reg, indent=2), encoding="utf-8")
print("db_config.json 已指向恢复库")
PY

# 6) 启动/重启平台（systemd 或 develop/linux/start.sh）；验证：
#    - 登录成功（JWT 密钥链切换到恢复的 .jwt_secret）
#    - 数据为备份时点数据
#    - 回退：停平台 → 把 db_config.json path 改回旧库 → （可选）删 .restored-* → 启动
