# database-management Delta

## MODIFIED Requirements

### Requirement: 连接配置管理
系统 SHALL 在数据库外部配置文件（`data/db_config.json`）中维护连接列表与当前激活连接，支持添加、编辑、删除、测试 SQLite 与 PostgreSQL 连接。PostgreSQL 密码 SHALL 加密存储且 API 返回时脱敏。

配置文件的路径语义 SHALL 为「存储相对、解析锚定」：配置文件、其 `.bak` 备份与 legacy 路径（`data/db_config.json`） SHALL 锚定 backend 根（由 `db_config` 模块按 `__file__` 推导），与进程 CWD 无关；配置内存储的默认 SQLite 连接路径 SHALL 保持相对形态 `./data/panshi.db`（目录整体迁移/整树复制后仍指向本树数据），锚定 SHALL 只发生在解析期（构建引擎 URL 时相对路径锚定 backend 根并自建父目录），SHALL NOT 把锚定后的绝对路径落盘。

连接测试 SHALL 不阻塞事件循环；密码加密密钥 SHALL 与 JWT 密钥同源（security 解析链）。

前端交互层 SHALL 前置防护（2026-10-30 edge：database-mgmt-ux-review-fixes）：当前激活连接的删除按钮 SHALL 禁用并以 tooltip 说明（后端 400 为最终防线）；新建/编辑弹窗 SHALL NOT 提供无法执行草稿测试的「测试连接」按钮；PostgreSQL 表单 SHALL 提供 SSL 开关；保存前 SHALL 做重名软校验。

#### Scenario: 添加 PostgreSQL 连接
- **WHEN** 管理员在数据库管理页填写主机、端口、数据库名、用户名、密码并点击保存
- **THEN** 系统 SHALL 将新连接写入配置并出现在连接列表中，密码以加密形式存储、列表显示脱敏
- **AND** 表单 SHALL 提供「启用 SSL 连接」开关并随保存提交
- **AND** 保存成功提示 SHALL 引导通过列表「测试」按钮验证可用性（弹窗内不再提供草稿测试按钮）

#### Scenario: 测试连接成功
- **WHEN** 管理员点击某连接的"测试连接"且目标数据库可达
- **THEN** 系统 SHALL 在 3 秒内返回连接成功
- **AND** 该行状态点 SHALL 显示为绿色（已验证连通）

#### Scenario: 测试连接失败
- **WHEN** 管理员点击某连接的"测试连接"且目标数据库不可达
- **THEN** 系统 SHALL 返回明确的失败原因（网络不通/认证失败/数据库不存在）
- **AND** 失败原因 SHALL 为中文分类描述（连接被拒绝/用户名或密码错误/数据库不存在/连接超时），无法分类的原始错误 SHALL 加「连接失败：」前缀后展示
- **AND** 失败 SHALL 在超时预算内返回（同步探测体卸载工作线程，不阻塞事件循环分钟级）
- **AND** 该行状态点 SHALL 显示为红色（验证失败）

#### Scenario: 删除连接
- **WHEN** 管理员删除一个非激活连接
- **THEN** 系统 SHALL 从配置中移除该连接

#### Scenario: 删除激活中的连接
- **WHEN** 管理员尝试删除当前激活的连接
- **THEN** 系统 SHALL 拒绝操作并提示先切换其他数据库
- **AND** 页面上当前激活连接的删除按钮 SHALL 呈禁用态并以 tooltip 说明「当前连接不可删除，请先切换到其他连接」（前端前置，后端 400 保留为最终防线）

#### Scenario: 连接测试不阻塞事件循环

- **WHEN** 管理员发起连接测试且目标数据库网络不可达
- **THEN** 同步探测体 SHALL 卸载到工作线程（`asyncio.to_thread`），`asyncio.wait_for` 超时 SHALL 真实生效并可取消
- **AND** 测试期间其他请求（登录、健康检查）SHALL 正常响应

#### Scenario: Fernet 密钥单源与存量迁移

- **WHEN** 后端启动且 db_config 中存在连接密码密文
- **THEN** 密码加密密钥 SHALL 复用 security 解析的 JWT_SECRET_KEY（同源单点）
- **AND** 若密文由旧密钥加密，启动 SHALL 自动用当前密钥重加密迁移（`ensure_config`）
- **AND** 换密钥导致不可解的密文 SHALL 有明确的失败表现而非静默错库

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

#### Scenario: 保存重名校验
- **WHEN** 管理员保存的连接名称与现有连接重名（编辑时排除自身）
- **THEN** 前端 SHALL 提示「已存在同名连接」并阻断保存

### Requirement: 当前数据库状态展示

系统 SHALL 提供当前数据库状态查询接口与页面展示，包括类型、连接地址、表数量、数据量、上次迁移时间。状态接口 SHALL 返回 `pending_restart` 标记切换待重启生效状态；当存在切换待重启标记时，页面与侧栏徽标 SHALL 明确区分「待生效配置」与「运行中连接」，不得把待生效连接当作已生效连接展示。

连接列表行状态点 SHALL 诚实表达验证状态：默认中性「未验证」，仅最近一次测试成功显示绿色、失败显示红色（内存会话态，刷新重置）。

#### Scenario: 查看当前数据库状态

- **WHEN** 管理员打开数据库管理页
- **THEN** 页面 SHALL 展示当前激活数据库的类型、地址、表数量、数据量、上次迁移时间
- **AND** 各连接行状态点默认 SHALL 为中性「未验证」态（tooltip「未验证连通性」），SHALL NOT 误导为已在线

#### Scenario: 切换待重启时状态接口返回待生效标记

- **WHEN** 数据库切换已完成写入配置且 `.restart.flag` 存在（后端尚未重启）
- **THEN** `GET /database/status` SHALL 返回 `pending_restart: true`
- **AND** 后端重启完成、切换标记清除后，接口 SHALL 返回 `pending_restart: false`

#### Scenario: 切换待重启时页面展示待生效标记

- **WHEN** `pending_restart` 为 true 且管理员查看数据库管理页
- **THEN** 当前连接展示区 SHALL 显示「待重启生效」警示标记
- **AND** 警示标记 SHALL 与既有重启指引提示联动，指引管理员完成重启

#### Scenario: 切换待重启时侧栏徽标显示待生效状态

- **WHEN** `pending_restart` 为 true 且管理员查看侧栏数据库徽标
- **THEN** 徽标文案 SHALL 追加「（待重启）」标记
- **AND** 悬停提示 SHALL 说明「切换待重启生效，数据仍来自旧库」

## ADDED Requirements

### Requirement: 连接表单 SSL 配置

PostgreSQL 连接表单 SHALL 提供「启用 SSL 连接」开关；编辑时 SHALL 回显该连接当前 SSL 配置；SQLite 类型下该配置不适用不渲染。

#### Scenario: SSL 开关展示与回显
- **WHEN** 用户新建或编辑 PostgreSQL 连接
- **THEN** 表单 SHALL 显示「启用 SSL 连接」开关
- **AND** 编辑已有连接时 SHALL 回显其当前 SSL 取值
