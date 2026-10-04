# database-management Delta

## MODIFIED Requirements

### Requirement: 连接配置管理

系统 SHALL 在数据库外部配置文件（`data/db_config.json`）中维护连接列表与当前激活连接，支持添加、编辑、删除、测试 SQLite 与 PostgreSQL 连接。PostgreSQL 密码 SHALL 加密存储且 API 返回时脱敏。

配置文件的路径语义 SHALL 为「存储相对、解析锚定」：配置文件、其 `.bak` 备份与 legacy 路径（`data/db_config.json`） SHALL 锚定 backend 根（由 `db_config` 模块按 `__file__` 推导），与进程 CWD 无关；配置内存储的默认 SQLite 连接路径 SHALL 保持相对形态 `./data/panshi.db`（目录整体迁移/整树复制后仍指向本树数据），锚定 SHALL 只发生在解析期（构建引擎 URL 时相对路径锚定 backend 根并自建父目录），SHALL NOT 把锚定后的绝对路径落盘。

#### Scenario: 添加 PostgreSQL 连接
- **WHEN** 管理员在数据库管理页填写主机、端口、数据库名、用户名、密码并点击保存
- **THEN** 系统 SHALL 将新连接写入配置并出现在连接列表中，密码以加密形式存储、列表显示脱敏

#### Scenario: 测试连接成功
- **WHEN** 管理员点击某连接的"测试连接"且目标数据库可达
- **THEN** 系统 SHALL 在 3 秒内返回连接成功

#### Scenario: 测试连接失败
- **WHEN** 管理员点击某连接的"测试连接"且目标数据库不可达
- **THEN** 系统 SHALL 返回明确的失败原因（网络不通/认证失败/数据库不存在）

#### Scenario: 删除连接
- **WHEN** 管理员删除一个非激活连接
- **THEN** 系统 SHALL 从配置中移除该连接

#### Scenario: 删除激活中的连接
- **WHEN** 管理员尝试删除当前激活的连接
- **THEN** 系统 SHALL 拒绝操作并提示先切换其他数据库

#### Scenario: 默认连接配置存储相对路径
- **WHEN** 系统自动生成 `db_config.json`（缺省配置、`DATABASE_URL` 环境变量初始化或 `ensure_config` 落盘）
- **THEN** 默认 SQLite 连接的 `path` SHALL 存储为相对路径 `./data/panshi.db`
- **AND** 系统 SHALL NOT 把锚定后的绝对路径写入配置文件

#### Scenario: 相对路径解析锚定 backend 根且与 CWD 无关
- **WHEN** 系统为 SQLite 连接构建引擎 URL，且连接 `path` 为相对路径
- **THEN** 解析结果 SHALL 锚定 backend 根（`resolve_sqlite_path`），与进程启动时的工作目录无关，并自建缺失的父目录
- **AND** 以任意 CWD 启动后端，缺省库 SHALL 始终指向 backend 树内的 `data/panshi.db`，SHALL NOT 出现 `unable to open database file` 类 CWD 漂移启动失败

#### Scenario: 存量绝对路径配置兼容
- **WHEN** 已生成的 `db_config.json` 中默认连接 `path` 为绝对路径（本语义生效前落盘）
- **THEN** 解析端 SHALL 原样透传该绝对路径，无需强制迁移

#### Scenario: 配置与备份路径锚定
- **WHEN** 系统读写 `db_config.json`、`db_config.json.bak` 或 legacy 的 `data/db_config.json`
- **THEN** 三者路径 SHALL 锚定 backend 根，MUST NOT 随进程 CWD 漂移
