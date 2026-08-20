## Why

当前系统仅以 SQLite 本地文件（`backend/data/panshi.db`）作为数据存储：机器损坏即数据丢失，且同一时刻只能有一个管理端访问。需要支持 PostgreSQL 远程存储，使数据持久化在远端、多个管理端可访问、单机故障不丢数据。

## What Changes

- **PostgreSQL 驱动补齐**：`asyncpg` 加入后端依赖（当前 `postgresql+asyncpg://` 分支存在但驱动未安装，PG 实为不可用状态）。
- **数据库配置管理**：新增 `data/db_config.json` 配置文件（数据库外部，避免鸡生蛋问题），管理连接列表与当前激活连接。新增「数据库管理」页面（系统管理菜单下），支持添加/编辑/测试/删除 PG 连接、查看当前库状态。顶栏右侧显示当前数据库状态徽标（类型+地址+状态圆点），点击跳转数据库管理页。
- **数据库切换（A1：配置+重启）**：切换 = 写入配置 → **用户手动重启后端服务** → 新库生效。JWT 密钥为静态默认值，重启后已登录会话保持有效，无需重新登录。系统不使用 Docker，切换不自动执行重启命令。
- **数据迁移（B1：直连流式 + B2：归档文件）**：
  - B1 直连流式：服务端同时连接源/目标引擎，按依赖顺序（users → clusters → upstreams → routes/nodes/plugins…）ORM 级搬运，**显式保留主键 ID**，迁移完成后重置目标库自增序列（PG `setval` / SQLite 自动 max+1）。仅支持替换模式（默认仅允许迁到空库；非空库需勾选「我了解将清空目标库，先备份再替换」确认）。
  - B2 归档文件：导出为 zip 归档（schema + 数据 + 元信息），支持离线/跨网络场景下导入到任意目标库。
- **迁移范围**：仅数据库内容（21 张表）。静态资源 ZIP 文件存放在 `data/static/` 磁盘目录，**不参与迁移**——迁移后 `storage_path` 原样保留，文件仍在磐石所在机器磁盘上。
- **单向快照迁移**：不做双向同步。多管理端访问的正确姿势是连接同一个 PG；单机离线使用通过 PG→SQLite 整库快照拉取实现。迁移期间源库写操作被锁定（维护模式），保证切换后数据一致。
- **V1 单实例假设**：不支持两台机器同时连同一 PG 运行（node_task_service 内存态任务在双实例下会重复执行，后续版本需引入 DB 级锁）。

## Capabilities

### New Capabilities
- `database-management`: 数据库连接配置管理（添加/测试/切换/查看状态）与运行期切换机制（配置+重启）

### Modified Capabilities

（无既有 spec 的能力行为变更。`db-schema-migration` 已覆盖启动时 schema 修复，本次不改变其行为。）

## Impact

- **后端**：
  - `app/core/database.py` — 引擎创建改为从 `data/db_config.json` 读取激活连接（不再只读环境变量）
  - 新增 `app/core/db_config.py` — 连接配置读写、测试连接
  - 新增 `app/services/db_migration.py` — 直连流式迁移 + 归档导入导出
  - 新增 `app/api/v1/database.py` — 配置管理 + 切换 + 迁移 REST API
  - `app/core/migrate.py` — 启动迁移逻辑在 PG 下同步生效（已有 PG 分支，需实测验证）
  - `app/main.py` — 提供重启端点（受管理员权限保护）
- **依赖**：`pyproject.toml` 增加 `asyncpg`、`psycopg`（同步引擎 PG 驱动）
- **前端**：
  - 新增 `src/views/DatabaseManagement.vue` — 数据库管理页
  - 新增 `src/api/database.ts` — API 封装
  - 路由/菜单注册（系统管理分区）
- **配置**：新增 `data/db_config.json`（git 忽略）；`docker-compose.yml` 的 `DATABASE_URL` 环境变量逻辑迁移到配置文件的首次初始化
- **测试**：后端 pytest（迁移服务单测 + 配置 API 测试）、前端 Vitest（页面组件）+ Playwright（切换流程 E2E）