# Proposal: add-clickhouse-config-page

## Why

ClickHouse 连接配置目前只能手改 `backend/app/config/clickhouse.yaml`，且改后**不会生效**（`clickhouse_client` 全局缓存 + 线程局部 client，须重启后端）；密码明文存储且文件在 git 跟踪中，填入真实密码即有入库泄密面。平台同类配置（数据库连接）已有成熟的"命名连接列表 + 激活切换"管理页（`backend/db_config.json` 模型），ClickHouse 配置应对齐同款形态。

## What Changes

（决策已确认：独立页面归"系统管理"组 + 独立权限键 `clickhouse_config`；密码 Fernet 加密不回显；**数据模型对齐数据库管理页——多条命名连接、激活其一供 metrics 使用**）

- **配置文件迁移与结构化**：`backend/app/config/clickhouse.yaml` → `backend/clickhouse.yaml`（与 `db_config.json` 平级，git mv 保历史）；格式升级为 `connections: [ {id, name, host, port, database, user, password_enc, connect_timeout} ] + active: <id>`（同构 ConnectionConfig）；旧单连接格式/旧路径文件读取兼容（自动包成一条"默认"连接，下次保存转新格式）。
- **密码加密存储**：复用 `db_config.py` 的 Fernet 工具（`password_enc`，密钥同 JWT secret 派生）；API 与页面**永不回传密码**，编辑留空=不修改。
- **新增后端 API**（`api/v1/clickhouse_config.py`，路由级 `get_current_user` + `require_permission('clickhouse_config')`，端点风格对齐 `database.py`）：
  - `GET /clickhouse/connections`——连接列表（无密码值，含 `password_set` 与 active 标记）
  - `POST /clickhouse/connections` / `PUT /clickhouse/connections/{id}` / `DELETE .../{id}`（删除守卫：当前激活连接与最后一条不可删）
  - `POST /clickhouse/connections/{id}/test`（按已存参数试连，密码留空用已存）+ `POST /clickhouse/connections/test`（未保存表单试连，不落盘）
  - `POST /clickhouse/activate` `{id}`——切换激活连接，成功即**强制缓存失效**（metrics 下一查询走新连接，免重启）；写/删/激活变更均 `log_audit`（不含密码）
- **新增前端页面** `views/ClickHouseConfig.vue`：交互参照 DatabaseManagement——连接列表（名称/地址/库/激活标记）+ 新建/编辑弹窗（手写 modal-overlay，约定 #25）+ 逐条"测试连接" + "激活" + 删除确认；路由 `meta.permission='clickhouse_config'`，左侧菜单"系统管理"组新增"ClickHouse 配置"。
- **权限键双端注册**（约定 #19）：后端门控 + `UserList.vue` permissionGroups"系统管理"分类 + `permissionKeyToLabel`。

不做：导出/导入/迁移历史（database.py 的重型能力不复制）；YAML 文本双模式；feature 开关（仅权限键）；多 ClickHouse 并发查询（metrics 仍单激活源）。

## Capabilities

### New Capabilities

- `clickhouse-config-management`：多命名连接 CRUD + 激活切换、密码加密与不回显语义、激活/修改即生效（跨线程缓存失效）、权限门控与审计。

### Modified Capabilities

- `clickhouse-metrics-query`："ClickHouse connection configuration" 需求的路径与格式变更（`backend/clickhouse.yaml`，connections+active 结构，密码 `password_enc`）+ "激活/保存后免重启生效"场景。归档时同步 main spec。

## Impact

- 后端：`services/clickhouse_client.py`（配置解析改激活连接 + 版本号失效）、`api/v1/clickhouse_config.py`（新）、`api/v1/__init__.py` 挂路由
- 前端：`views/ClickHouseConfig.vue`、`api/clickhouse.ts`（约定 #6）、`router/index.ts`、`AppSidebar.vue`、`UserList.vue`
- 数据：现库单连接文件自动包装为"默认"连接；Fernet key 换钥则密码需重录（与 db_config 同约束，约定 #20）
- 风险：低-中——涟漪点在 clickhouse_client（既有 metrics 测试基线兜底）；数据库管理页交互被复用时注意其"激活切换会换平台主库"的语义此处不存在（这里只换指标源），文案需区分
