# Design: db-config-portability

## Context

两层事故链：① 进程 CWD 漂移 → 相对路径解析到错误位置 → 启动失败；② 修复锚定后把绝对路径写进配置 → 目录迁移后静默指向旧树并新建空库。`clickhouse_client._CONFIG_PATH`、`db_backup_service.resolve_db_path` 已有 `__file__` 锚定先例。

## Decisions

- **D1 锚定单点**：`BACKEND_ROOT = Path(__file__).resolve().parents[2]`，全部路径常量（CONFIG_PATH / CONFIG_BAK_PATH / LEGACY_CONFIG_PATH / DEFAULT_SQLITE_PATH）锚定其上；`resolve_sqlite_path` 对相对路径锚定并自建父目录（`mkdir` 失败静默跳过、交由 sqlite 报错——错误更接近真实原因）。
- **D2 存储相对、解析锚定（本变更核心语义）**：写侧（`default_config` / `config_from_env` / `ensure_config` 落盘）统一用 `DEFAULT_SQLITE_STORED_PATH = "./data/panshi.db"`；读侧（`resolve_sqlite_path` / `build_engine_url`）锚定为绝对。二者不得混用——绝对路径落盘会让目录迁移后静默指向旧位置，相对路径直连 CWD 又回到事故 ①。该语义写入 spec 供未来改动对照。
- **D3 绝对路径兼容**：解析端对已是绝对路径的存量配置原样透传，零迁移。
- **D4 ClickHouse 模板随包**：候选链 `backend/clickhouse.yaml`（配置页维护，保存即生效）→ `app/config/clickhouse.yaml`（随包模板）→ 缺省；模板只含占位值（127.0.0.1）与结构说明，口令一律经配置页录入（`password_enc` 加密），模板不携带任何口令字段。运行态文件（`backend/db_config.json`、`backend/clickhouse.yaml`）为启动自生成/配置页维护产物，解除 git 跟踪。
- **D5 不做历史清洗**：加密口令仍存于 git 历史（内网指标库，风险可控）；彻底清除需 filter-repo 重写历史，影响所有 clone，另行决策。

## Risks / Trade-offs

- 相对存储依赖「解析端永远锚定」这一纪律，若未来有人绕过 `resolve_sqlite_path` 直接拼 URL 会回到事故 ①——`test_db_paths_cwd.py` 守卫四用例（落盘相对 + 解析锚定）防回归。
