# Proposal: db-config-portability

## Why

2026-10-04 产品事故：产品环境以非 `backend/` 工作目录启动后端，`db_config` 的 `./db_config.json` 与缺省 SQLite `./data/panshi.db` 按进程 CWD 解析漂移 → `sqlite3.OperationalError: unable to open database file`，应用启动失败。锚定修复落地后又暴露第二层问题：锚定版把**绝对路径**写进自动生成的 `db_config.json`——产品目录整体迁移 / 整树复制后，配置仍指向旧绝对位置并在那里静默新建空库（数据「消失」假象）。另有 ClickHouse 配置缺口：产品机上两条候选路径全空（legacy 模板文件从未入库），ClickHouse 连接只能靠 UI 首次保存生成（与 db_config.json 的启动自愈行为不一致）；且运行态配置文件（含真实内网地址与加密口令的 `backend/clickhouse.yaml`、启动自生成的 `backend/db_config.json`）此前被 git 跟踪。

## What Changes

- **路径锚定（与进程 CWD 无关）**：`db_config` 新增 `BACKEND_ROOT`（`__file__` 推导，同 `clickhouse_client` 先例），`CONFIG_PATH` / `CONFIG_BAK_PATH` / `LEGACY_CONFIG_PATH` / `DEFAULT_SQLITE_PATH` 全部锚定；新增 `resolve_sqlite_path`（相对路径锚定 backend 根 + 父目录自建，权限异常交由 sqlite 报错）；`build_engine_url` / `config_from_env` / `database.DEFAULT_DATABASE_URL` 同步走锚定。CWD=backend 的正确启动解析结果不变，零迁移成本。
- **存储相对、解析锚定（有意设计，语义各归其位）**：写进 `db_config.json` 的默认连接路径 SHALL 保持相对形态——`DEFAULT_SQLITE_STORED_PATH = "./data/panshi.db"`（目录整体迁移/整树复制后配置仍指向本树数据）；锚定只发生在解析期（`resolve_sqlite_path` / `build_engine_url`）。不得把锚定后的绝对路径落盘。已生成的绝对路径配置兼容透传，无需强制迁移。
- **ClickHouse 随包模板**：新增 `backend/app/config/clickhouse.yaml`（占位 127.0.0.1、无任何口令、含使用说明）；候选链：`backend/clickhouse.yaml`（配置页维护）→ 随包模板 → 缺省。
- **运行态配置解除 git 跟踪**：`backend/db_config.json`、`backend/clickhouse.yaml` 加 `.gitignore`（本地文件保留，运行不受影响）。

## Capabilities

### Modified

- `database-management`：「连接配置管理」补路径锚定与「存储相对、解析锚定」语义——默认连接存相对路径、解析与 CWD 无关、配置/备份/legacy 路径全部锚定 backend 根
- `clickhouse-config-management`：「命名连接管理 API」补随包模板候选链与模板形状约束（占位地址、无口令）及运行态配置不入库语义

## Impact

- 后端：`backend/app/core/db_config.py`（锚定常量、resolve_sqlite_path、DEFAULT_SQLITE_STORED_PATH）、`backend/app/core/database.py`（DEFAULT_DATABASE_URL 锚定）
- 配置：`backend/app/config/clickhouse.yaml`（新增随包模板）；`.gitignore`（运行态配置解除跟踪）；`backend/clickhouse.yaml`、`backend/db_config.json`（移出 git 跟踪，本地文件保留）
- 测试：`backend/tests/test_db_paths_cwd.py`（新增，锚定 + 存储相对守卫）、`backend/tests/test_db_config.py`（既有 test_sqlite_url 断言随语义更新）、`backend/tests/test_db_switch_service.py`（隔离夹具补丁新常量）、`backend/tests/test_clickhouse_client_config.py`（TestShippedTemplate 双用例）
- 风险：低——已生成的绝对路径配置由解析端透传兼容；加密口令仍存于 git 历史（内网指标库，低风险），彻底清除需 filter-repo 重写历史，另行决策
