## Context

当前后端使用 SQLAlchemy 2.0 async 引擎连接 SQLite（`backend/data/panshi.db`），`DATABASE_URL` 环境变量在模块导入时读取一次并创建模块级单例引擎。代码中已存在 `postgresql+asyncpg://` 的方言转换分支和 PG 迁移逻辑（`migrate.py` 的 `_fix_postgresql_table`），但 `asyncpg` 驱动未加入 `pyproject.toml` 依赖，且 `docker-compose.yml` 的 PG 配置实际不可用。

数据层为 22 张自增 Integer 主键表（外加本变更新增 1 张 `ps_db_migration_log` = 23 张），外键网络密集（几乎全部指向 `ps_cluster.id`，另有 `upstream_id`/`route_id`/`task_id`/`user_id`/`ca_cert_id` 等二级引用）。静态资源 ZIP 文件存于 `data/static/{edge_uuid}/{version}.zip` 磁盘目录，数据库仅存 `storage_path` 路径。

本变更让数据库可配置化：支持 SQLite 本地存储与 PostgreSQL 远程存储双后端，支持两种方向的单向快照迁移，支持通过 UI 配置与切换。

## Goals / Non-Goals

**Goals:**
- 数据库连接可配置：连接列表（SQLite 本地 + 多个 PG 远程）、测试连接、编辑、删除
- 数据库切换：写入配置 + 后端重启后新库生效（A1 机制），已登录会话保持有效
- 数据迁移：B1 直连流式（源/目标同时可达）与 B2 归档文件（离线/跨网络）两种传输方式
- 迁移保留主键 ID 与全部外键关系，迁移后自增序列对齐
- 单向快照语义：迁移即替换，不做双向同步
- 提供后台任务进度反馈（复用项目已有的任务进度交互模式）

**Non-Goals:**
- 双向数据同步 / 多主合并（脑裂风险，见提案）
- 多实例并发连接同一 PG（V1 单实例假设，`node_task_service` 内存态任务在双实例下会重复执行）
- 静态资源文件迁移（ZIP 文件留在磁盘，`storage_path` 原样保留）
- 迁移断点续传（v1 失败即回滚/恢复备份）
- 数据库 schema 变更管理（既有 `db-schema-migration` 能力已覆盖，不重复建设）

## Decisions

### D1: 连接配置存于数据库之外的 `data/db_config.json`

配置必须在数据库引擎可用之前可读，因此不能存进业务表。

```json
{
  "version": 1,
  "active": "local_sqlite",
  "connections": [
    {
      "id": "local_sqlite",
      "type": "sqlite",
      "name": "本地 SQLite",
      "path": "./data/panshi.db"
    },
    {
      "id": "prod_pg",
      "type": "postgres",
      "name": "生产 PG",
      "host": "192.168.1.10",
      "port": 5432,
      "database": "panshi",
      "username": "panshi",
      "password_enc": "Fernet密文",
      "ssl": false
    }
  ]
}
```

- **密码处理**：`password_enc` 用 Fernet 对称加密存储，密钥由 `JWT_SECRET_KEY` 派生。API 返回时永远脱敏（`password_set: true` 代替明文）。
- **文件权限**：配置文件 chmod 600。
- **环境变量兼容**：`db_config.json` 不存在但 `DATABASE_URL` 存在时（docker-compose 场景），启动时以环境变量生成初始配置并落盘，实现无缝过渡。
- 备选方案：仅用环境变量。否决——无法表达"多个连接 + 命名 + UI 管理"。

### D2: 引擎只在启动时创建一次（A1 重启切换的基础）

不实现运行期热换绑（A2）。理由：

- 引擎/连接池/事件监听（WAL PRAGMA）都是启动期一次性设置，热换绑需要排空在途请求、处理连接泄漏，复杂度与风险不成比例。
- 切换操作是管理员低频动作，2-3 秒重启完全可接受。
- JWT 密钥为静态默认值（`security.py`），重启后 token 不失效，前端无需重新登录，实现"用户无感"。

**切换流程**：

```
UI 确认 → POST /api/v1/database/switch {connection_id}
  → 后端校验目标连接可达（带超时）
  → 写入 db_config.json（active 更新，旧配置保留为 db_config.json.bak）
  → 返回成功 + 提示"请重启后端服务"
  → 用户/运维执行重启（start.sh / systemd restart）
  → 前端轮询 /health 恢复后刷新页面
```

**切换前检测运行中任务**：切换接口先检查源库 `install_task` 中是否存在 running 状态任务。存在则拒绝切换，提示"有任务正在运行，请等待完成或取消后再切换"，并列出运行中任务。仅当源库无 running 任务时才允许切换。作为兜底，切换执行瞬间仍会扫描一次 running 任务并标记为 interrupted（防御竞态：检查与切换之间任务恰好进入 running），历史记录保留在源库。

**切换空库策略**：允许切换到空库，但明确警告。切换前检测目标库是否为空（行数为 0）：为空时提示「目标库为空，切换后仅保留 admin 账号，其他用户需重新创建，当前会话将失效、需重新登录」，用户确认后照切。空库切换本质是初始化新环境，会话失效为合理预期，不强制要求先迁移。

**配置损坏降级**：`init_db()` 解析 `db_config.json` 失败（JSON 语法错误/结构非法/激活连接不存在）时，先尝试回退到 `db_config.json.bak`（上次成功切换前的配置）；`.bak` 也无效时回退默认 SQLite（`data/panshi.db`）。始终保证服务能启动，配置异常通过管理页告警横幅提示管理员处理。切换失败自动回滚：存在切换标记且激活连接无法建立时，回退到 `.bak` 备份的旧配置并启动。

**迁移引擎隔离**：迁移服务创建独立的源/目标引擎实例，**不触碰全局单例**。迁移进行中应用继续使用当前激活库，迁移完成后再切换。

**迁移期间的写操作锁定（维护模式）**：迁移开始后，后端将源库置为只读——所有写接口（POST/PUT/DELETE/PATCH）返回 503 维护中，读接口正常服务。迁移完成后自动解除锁定。保证迁移快照与切换后数据一致，实现真正无感切换。迁移通常为分钟级，短暂维护可接受。

**迁移方向限制**：允许任意 source≠target 连接组合（迁移引擎不区分数据库类型，SQLite→PG、PG→SQLite、SQLite→SQLite、PG→PG 均可），但禁止 target==active（迁移到当前正在使用的库 = 清空自己，无意义且危险）。UI 提供两个快捷方向按钮（SQLite→PG / PG→SQLite），高级模式可选任意连接组合。

**静态资源文件位置提示**：静态资源 ZIP 文件存储于服务器磁盘（`data/static/`），`storage_path` 为机器相关的绝对路径，迁移时原样保留。V1 单实例假设下静态资源仅部署该文件的本机可访问。迁移页面与切换页面 UI 均提示「静态资源文件存储于服务器磁盘，仅部署该文件的本机可访问」。不做路径改造（相对路径改造影响面大，V1 无收益）。

### D3: 迁移以 SQLAlchemy ORM 层搬运，不写方言 SQL

- 按依赖顺序逐表 `SELECT` 源行 → 显式指定主键 `INSERT` 到目标（ID 原样保留，外键网络完整）。
- SQLAlchemy 类型系统自动处理方言差异（Boolean 0/1↔bool、DateTime 文本↔timestamp、BigInteger 等）。
- 每批 500 行 commit，进度回调推进 UI。
- 表依赖顺序固定列表（拓扑排序结果，22 张业务表；`ps_db_migration_log` 为操作元数据，**不参与迁移**）：

```
1. sys_user, sys_audit_log, ps_cluster, ps_plugin_enabled   （无父依赖）
2. ps_upstream → ps_upstream_target
3. ps_route → ps_route_plugin
4. ps_plugin_metadata, ps_plugin_config, ps_global_rule, ps_stream_proxy,
   ps_static_resource, ps_import_log, ps_node, ps_config_version
5. ps_ssl_certificate（自引用 ca_cert_id，先插无 ca 父链的根证书，再插子证书）
6. ps_node_autostart, sys_user_cluster, sys_user_permission
7. install_task → install_task_node
```

- 迁移后序列对齐：PG 用 `setval(pg_get_serial_sequence(...))`；SQLite 模型未用 `AUTOINCREMENT` 关键字，`INTEGER PRIMARY KEY` 自动取 `max(id)+1`，无需处理。
- **迁移范围：默认全量迁移所有业务表（含日志类表 sys_audit_log/ps_import_log/install_task/install_task_node）**，数据完整性优先。UI 提供「包含日志数据」复选框（默认勾选），取消勾选则跳过日志类表以加速迁移。`ps_db_migration_log` 为操作元数据，始终不参与迁移（G3 已定）。
- **仅支持替换模式，不支持合并模式**（与「单向快照迁移」决策一致；合并模式与显式保留 ID 冲突，需 remap 外键，复杂度不成比例，v1 排除）。
- 替换模式：默认仅允许迁移到空目标库（行数为 0）；目标库非空时，UI 必须勾选「我了解将清空目标库，先备份再替换」确认。迁移前自动将目标库导出为归档备份（复用 B2 导出能力），失败可恢复。

### D4: 归档文件格式（B2）

zip 结构：

```
panshi-backup-20260820-1530.zip
├── meta.json          # 导出时间、来源连接、应用版本、表行数统计
├── schema.json        # 表清单 + 每表列定义（inspector 导出）
├── ddl/               # 每表原始 CREATE TABLE DDL（精确还原归档时刻的结构）
└── data/
    ├── sys_user.jsonl         # 每行一条 JSON 记录
    ├── ps_cluster.jsonl
    └── ...
```

- 导入流程：校验 meta 兼容性（归档应用版本不得高于当前应用，结构可迁移）→ 用归档内嵌 DDL 建表（精确还原归档时刻结构）→ 逐表 JSONL 流式导入 → 重置序列 → 运行 migrate.py 将结构升级到当前模型（对齐新增列/约束）。版本不兼容时拒绝并给出明确原因。
- 用途双份：离线迁移载体 + 迁移前备份（替换模式自动备份）。

### D5: 切换采用纯手动重启

后端不自杀、不执行重启命令（系统不使用 Docker，Docker 部署形态已废弃）。切换接口仅完成「校验连接 → 备份旧配置 → 写入新配置」，然后提示用户手动重启服务（`develop/linux/start.sh` 或 systemd）。重启完成后前端轮询 `/health` 恢复。

启动失败自动回滚：`init_db()` 检测到激活配置连接失败且存在 `.restart.flag` 切换标记时，自动回滚到 `db_config.json.bak` 备份的旧配置并继续启动。

### D6: API 设计

全部受 admin 权限保护（新增 `database_management` 权限，与既有权限体系一致）。

```
GET    /api/v1/database/status                    # 当前激活库 + 各连接状态（密码脱敏）
GET    /api/v1/database/connections               # 连接列表
POST   /api/v1/database/connections               # 添加连接（SQLite/PG）
PUT    /api/v1/database/connections/{id}          # 编辑连接
DELETE /api/v1/database/connections/{id}          # 删除（激活中的不可删）
POST   /api/v1/database/connections/{id}/test     # 测试连接（超时 3s）
POST   /api/v1/database/switch                    # {connection_id} → 写配置+触发重启
POST   /api/v1/database/migrate                   # {source_id, target_id, mode} 直连迁移（后台任务）
POST   /api/v1/database/export                    # {source_id} → 归档文件（后台任务）
POST   /api/v1/database/import                    # {archive_path, target_id, mode} 归档导入（后台任务）
GET    /api/v1/database/tasks/{task_id}           # 迁移/导出/导入进度查询
GET    /api/v1/database/history                   # 迁移历史
```

后台任务复用项目既有 `install_task` 任务中心模式（进度/结果/日志展示）。

### D7: 前端「数据库管理」页面

路由 `database-management`（系统管理分区，菜单项"数据库管理"），单页三块：

1. **当前数据库卡片** — 类型/地址/状态/表数量/上次迁移时间
2. **连接列表表格** — 名称/类型/地址/状态（当前徽标）/操作（测试、编辑、删除、设为当前）
3. **数据迁移卡片** — 双向按钮（SQLite→PG / PG→SQLite）+ 目标/源选择 + 模式选择（替换）+ 归档导出/导入入口 + 任务进度条

**右上角全局状态标识**：顶栏右侧显示当前数据库状态徽标（类型+地址+状态圆点），绿点=连接正常、红点=连接异常（连接失败降级回 SQLite 时告警）。悬停显示完整连接信息，点击跳转数据库管理页。切换入口仅保留在数据库管理页（切换不常用，避免频繁重启中断服务）。

切换走统一确认弹窗：说明重启影响、会话保持、目标库状态提示（空库警告「仅保留 admin、会话将失效」/已有数据替换确认）、运行中任务列表（如有则禁止切换）。

## Risks / Trade-offs

- **[目标库误清空]** → 替换模式迁移前自动归档备份目标库（复用 B2），失败/误操作可恢复。
- **[迁移中断]** → 不做断点续传，失败后引导从备份恢复；迁移服务对源库只读，源库永远安全。
- **[PG 驱动/方言边界问题]** → 迁移层用 ORM 类型系统规避绝大多数差异；`migrate.py` 已有 PG 分支，实测验证补齐。
- **[重启后起不来]** → switch API 先测试连接再写配置；写配置前保留旧配置副本 `db_config.json.bak`，启动失败可回滚。
- **[并发误操作]** → 迁移/切换/导出均为 admin-only；迁移任务运行中禁止再次发起（单任务锁）。
- **[密码泄露]** → Fernet 加密 + 文件 600 + API 脱敏 + 日志脱敏。
- **[docker-compose 过渡]** → 环境变量兼容逻辑保证现有部署升级后首次启动自动生成等价配置，不破坏已有 PG 部署。

## Migration Plan

1. 后端依赖加 `asyncpg`、`psycopg`（同步引擎 PG 驱动），`uv sync` 更新锁文件
2. 引入 `db_config.json` 读取/写入/迁移逻辑（含环境变量兼容），重构 `database.py` 引擎创建
3. 实现数据库管理 API（连接 CRUD + 测试 + 切换 + 重启触发）
4. 实现迁移服务（B1 直连流式 + B2 归档导入导出 + 替换备份）
5. 实现前端页面与 API 封装、路由/菜单注册
6. 后端 pytest + 前端 Vitest + Playwright E2E（切换流程 + 迁移流程）
7. 实测 SQLite→PG、PG→SQLite 双向迁移，验证 ID 对齐与外键完整性

**回滚**：回滚仅涉及代码回退；`db_config.json` 为新增文件不破坏旧版本（旧版本忽略它，继续用环境变量）。已在 PG 上的数据不回滚（单向快照迁移语义）。

## Open Questions

- RESTART_COMMAND 的默认注入方式：systemd 环境变量 vs features.yaml？实现时与部署脚本（`deployment/`、`prepare/`）确认。
- 迁移历史存哪：复用 `sys_audit_log` 还是独立表？倾向独立表 `ps_db_migration_log`（与业务审计分离）。