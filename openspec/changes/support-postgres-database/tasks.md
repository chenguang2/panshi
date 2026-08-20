## 1. 依赖与配置基础设施

- [ ] 1.1 在 `backend/pyproject.toml` 添加 `asyncpg`（异步 PG 驱动）与 `psycopg[binary]`（同步 PG 驱动）依赖，`uv sync` 更新 `uv.lock`
- [ ] 1.2 新增 `app/core/db_config.py`：定义连接数据模型（SQLite/PG）、读写 `data/db_config.json`（含 chmod 600）、密码 Fernet 加解密（密钥由 JWT_SECRET_KEY 派生）、环境变量兼容初始化（无配置但有 DATABASE_URL 时生成初始配置）、配置损坏降级（解析失败回退 `.bak` → 默认 SQLite）
- [ ] 1.3 重构 `app/core/database.py`：引擎创建改为读取 `db_config.json` 的激活连接；保留 `is_sqlite()` 等公共接口签名；提供 `build_engine(connection)` 供迁移服务复用
- [ ] 1.4 新增 `app/core/db_migration.py`：定义 22 张业务表的依赖顺序常量表（排除 `ps_db_migration_log`）、迁移任务状态机（pending/running/success/failed）、单任务锁
- [ ] 1.5 新增 `app/models/db_migration.py`：`ps_db_migration_log` 表（时间、方向、源/目标连接、模式、结果、备份归档路径）

## 2. 数据库管理 API

- [ ] 2.1 新增 `app/api/v1/database.py`：连接 CRUD（GET/POST/PUT/DELETE + 密码脱敏返回）、连接测试（3s 超时）、当前状态查询
- [ ] 2.2 实现切换端点 `POST /api/v1/database/switch`：检查源库 running 任务（存在则拒绝）→ 校验目标可达 → 备份旧配置（`db_config.json.bak`）→ 更新 active + 写入 `.restart.flag` 切换标记 → 兜底标记竞态 running 任务为 interrupted → 返回提示"请手动重启服务"；`init_db()` 实现启动失败自动回滚（激活连接失败且存在切换标记时回滚到备份配置）
- [ ] 2.3 在 `app/api/v1/__init__.py` 注册 database 路由，`app/core/features.py` 增加 `database_management` 已知功能名并默认启用
- [ ] 2.4 迁移/导出/导入端点（后台任务）：`POST /api/v1/database/migrate`、`export`、`import`、任务进度查询、迁移历史查询；接入任务中心进度交互
- [ ] 2.5 权限控制：所有接口要求 admin 角色 + `database_management` 权限，无权限返回 403

## 3. 迁移服务实现

- [ ] 3.1 实现直连流式迁移（B1）：按依赖顺序逐表 SELECT 源行 → 显式 ID INSERT 目标（每批 500 行 commit）→ 进度回调 → 完成重置序列（PG `setval` / SQLite 自动 max+1）
- [ ] 3.2 实现替换模式：迁移前检查目标库行数（空库直接执行；非空库要求勾选「我了解将清空目标库，先备份再替换」确认）→ 自动导出目标库为归档备份 → 按子→父顺序清空目标表 → 导入 → 失败时提示从备份恢复
- [ ] 3.8 日志数据可选迁移：UI 提供「包含日志数据」复选框（默认勾选），取消勾选则跳过日志类表（sys_audit_log/ps_import_log/install_task/install_task_node）
- [ ] 3.3 实现归档导出（B2）：`meta.json` + `schema.json`（inspector 导出列定义）+ `data/*.jsonl` 打包为 zip，提供下载
- [ ] 3.4 实现归档导入（B2）：校验 meta 兼容性（版本不高于当前应用、结构可迁移）→ 归档内嵌 DDL 建表（还原归档时刻结构）→ JSONL 流式导入 → 重置序列 → 运行 migrate.py 结构升级到当前模型
- [ ] 3.5 迁移事务安全：源库只读不修改；目标库操作失败回滚当批数据；迁移记录写入 `ps_db_migration_log`
- [ ] 3.6 实现迁移期间写操作锁定：迁移启动时设置全局只读标志，中间件拦截写请求返回 503，迁移完成/失败时解除锁定
- [ ] 3.7 迁移方向校验：禁止 target==active（当前激活库），允许任意 source≠target 类型组合

## 4. 前端实现

- [ ] 4.1 新增 `frontend/src/api/database.ts`：连接 CRUD、测试、切换、迁移、导出、导入、历史查询 API 封装
- [ ] 4.2 新增 `frontend/src/views/DatabaseManagement.vue`：当前数据库状态卡片 + 连接列表表格（操作列：测试/编辑/删除/设为当前）+ 数据迁移卡片（双向迁移、替换/合并模式、归档导入导出、任务进度条）
- [ ] 4.3 添加连接/编辑连接 Modal（类型选择、连接测试按钮、保存校验）
- [ ] 4.4 切换确认弹窗：说明重启影响、会话保持、目标库状态提示（空库警告「仅保留 admin、会话将失效」/已有数据替换确认）、运行中任务列表（如有则禁止切换）
- [ ] 4.5 路由与菜单注册：`database-management` 路由（系统管理分区），`DefaultLayout.vue` 的 sectionMap/pageNameMap 增加映射
- [ ] 4.6 迁移与切换页面提示静态资源文件位置（「静态资源文件存储于服务器磁盘，仅部署该文件的本机可访问」）
- [ ] 4.7 顶栏右侧数据库状态徽标组件：显示当前激活库类型+地址+状态圆点（绿/红），悬停显示完整连接信息，点击跳转数据库管理页（切换入口仅保留在管理页）

## 5. 测试

- [ ] 5.1 后端单测：`db_config.py` 读写/加密/环境变量兼容、连接测试逻辑、序列重置 SQL 生成
- [ ] 5.2 后端单测：迁移服务（SQLite→SQLite 内存库直连迁移验证 ID 保留、外键完整、序列对齐；替换/合并模式；归档导出→导入往返一致）
- [ ] 5.3 后端集成测试：database API 全链路（CRUD、测试、切换、迁移任务、历史）带 pytest-asyncio
- [ ] 5.4 前端 Vitest：DatabaseManagement 组件渲染、连接表单校验、迁移进度展示
- [ ] 5.5 Playwright E2E：登录 → 打开数据库管理页 → 添加连接 → 测试连接 → 执行迁移 → 切换数据库 → 验证服务恢复与页面可用

## 6. 部署与验证

- [ ] 6.1 实测 SQLite→PG 直连迁移：启动本地 PG 容器（docker-compose 或临时容器），迁移后校验表数、行数、ID 连续、外键查询正常、页面数据完整
- [ ] 6.2 实测 PG→SQLite 迁移：远程 PG 数据搬回本地后单机可用，静态资源路径不受影响
- [ ] 6.3 验证切换重启流程：RESTART_COMMAND 配置场景与手动重启场景，切换后 JWT 会话有效无需重新登录
- [ ] 6.4 更新 README 数据库章节（双后端支持、配置方式、迁移操作指引）