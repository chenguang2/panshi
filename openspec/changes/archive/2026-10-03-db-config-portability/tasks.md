# Tasks: db-config-portability

> 追溯性建档：代码已合入（9601e4e9、5db2e577、164c9920），以下为实际执行记录。前两个 commit 均按 TDD（RED→GREEN）推进（约定 #16）。

## 1. 组 1 — 路径锚定，修 CWD 漂移（9601e4e9）

- [x] 1.1 （RED）新增 `backend/tests/test_db_paths_cwd.py`：非 backend CWD 下解析 `db_config.json` / `.bak` / legacy 路径 / 缺省 SQLite 路径，断言全部锚定 backend 根、与进程 CWD 无关
- [x] 1.2 （GREEN）`db_config.py` 新增 `BACKEND_ROOT` 与锚定路径常量、`resolve_sqlite_path`（相对路径锚定 + 父目录自建）；`build_engine_url` / `config_from_env` / `database.DEFAULT_DATABASE_URL` 同步走锚定
- [x] 1.3 既有 `tests/test_db_config.py` 的 `test_sqlite_url` 断言随新语义更新
- [x] 1.4 回归：db 域八族 218 passed；全量 2270 passed / 11 skipped

## 2. 组 2 — 存储相对，修绝对路径落盘（5db2e577）

- [x] 2.1 （RED）`test_db_paths_cwd.py` 增四用例：`default_config` / `config_from_env` / `ensure_config` 落盘的默认连接路径均存相对形态 `./data/panshi.db`，且默认连接经 `build_engine_url` 解析仍锚定 backend 根
- [x] 2.2 （GREEN）`db_config.py` 新增 `DEFAULT_SQLITE_STORED_PATH = "./data/panshi.db"`；`default_config` / `config_from_env` 两个生成口改用它；解析端维持锚定绝对
- [x] 2.3 `tests/test_db_switch_service.py` 隔离夹具同步补丁新常量
- [x] 2.4 回归：直测 17 + db 域八族 227 + 全量 2276 passed / 11 skipped

## 3. 组 3 — ClickHouse 随包模板与运行态解耦（164c9920）

- [x] 3.1 新增 `backend/app/config/clickhouse.yaml`：占位 127.0.0.1、无任何口令、含使用说明（native 端口 9000、口令经配置页录入等）
- [x] 3.2 `backend/db_config.json`、`backend/clickhouse.yaml` 解除 git 跟踪并加 `.gitignore`（本地文件保留，运行不受影响）
- [x] 3.3 `tests/test_clickhouse_client_config.py` 新增 `TestShippedTemplate` 双用例（模板存在且可解析 + 形状/占位地址/无口令守卫）
- [x] 3.4 回归：clickhouse 三件套 30 passed
