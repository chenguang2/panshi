# database-management Delta

## MODIFIED Requirements

### Requirement: 连接配置管理
系统 SHALL 在数据库外部配置文件（`data/db_config.json`）中维护连接列表与当前激活连接，支持添加、编辑、删除、测试 SQLite 与 PostgreSQL 连接。PostgreSQL 密码 SHALL 加密存储且 API 返回时脱敏。

配置文件的路径语义 SHALL 为「存储相对、解析锚定」：配置文件、其 `.bak` 备份与 legacy 路径（`data/db_config.json`） SHALL 锚定 backend 根（由 `db_config` 模块按 `__file__` 推导），与进程 CWD 无关；配置内存储的默认 SQLite 连接路径 SHALL 保持相对形态 `./data/panshi.db`（目录整体迁移/整树复制后仍指向本树数据），锚定 SHALL 只发生在解析期（构建引擎 URL 时相对路径锚定 backend 根并自建父目录），SHALL NOT 把锚定后的绝对路径落盘。

连接测试 SHALL 不阻塞事件循环；密码加密密钥 SHALL 与 JWT 密钥同源（security 解析链）。

前端交互层 SHALL 前置防护（2026-10-30 edge：database-mgmt-ux-review-fixes）：当前激活连接的删除按钮 SHALL 禁用并以 tooltip 说明（后端 400 为最终防线）；新建/编辑弹窗 SHALL NOT 提供无法执行草稿测试的「测试连接」按钮；PostgreSQL 表单 SHALL 提供 SSL 开关；保存前 SHALL 做重名软校验；**PostgreSQL 表单的必填字段（主机、数据库名）SHALL 客户端校验前置，空必填项 MUST NOT 提交至后端**。**连接切换/保存/删除/测试等写操作 SHALL 捕获失败并展示含后端原因的中文错误反馈（迁移锁 503、任务运行中 400、校验 422、网络错误分类上屏），MUST NOT 静默无反馈；503 锁提示 SHALL 含「迁移进行中、完成后自动恢复、进度见数据迁移页」出口指引**（2026-10-31 db-migration-ux-optimization）。

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

#### Scenario: 必填字段缺失阻断保存
- **WHEN** 管理员保存 PostgreSQL 连接且主机或数据库名为空
- **THEN** 前端 SHALL 阻断提交并在对应字段标注错误提示，MUST NOT 将空必填项提交至后端

#### Scenario: 写操作失败反馈上屏
- **WHEN** 连接切换/保存/删除/测试请求失败（含迁移锁 503、任务运行中 400、校验 422、网络错误）
- **THEN** 页面 SHALL 展示含后端原因的中文错误提示；503 锁提示 SHALL 含「迁移进行中、完成后自动恢复、进度见数据迁移页」出口指引，MUST NOT 静默无反馈

### Requirement: 数据库切换
系统 SHALL 支持将激活数据库切换为连接列表中的其他连接。切换 SHALL 通过写入配置并触发后端重启实现（A1 机制），切换后已登录会话保持有效、用户无需重新登录。**切换成功后界面 SHALL 即时展示带具体重启操作的重启指引反馈（复用既有「待重启生效」指引文案与命令），MUST NOT 仅以一闪而过的 message 结束**（2026-10-31 db-migration-ux-optimization）。

#### Scenario: 切换到 PostgreSQL
- **WHEN** 管理员确认将当前 SQLite 切换为某个 PostgreSQL 连接
- **THEN** 系统 SHALL 校验目标连接可达、备份旧配置、更新激活连接配置，并提示用户手动重启后端服务

#### Scenario: 切换后会话保持
- **WHEN** 后端因切换重启完成
- **THEN** 已登录用户的令牌 SHALL 仍有效，前端刷新后无需重新登录

#### Scenario: 切换前目标库为空
- **WHEN** 管理员选择切换到一个无数据的连接
- **THEN** 系统 SHALL 提示「目标库为空，切换后仅保留 admin 账号，其他用户需重新创建，当前会话将失效、需重新登录」，用户确认后允许切换

#### Scenario: 配置损坏时自动降级
- **WHEN** 启动时 `db_config.json` 解析失败（JSON 语法错误/结构非法/激活连接不存在）
- **THEN** 系统 SHALL 先尝试回退到 `db_config.json.bak`，备份也无效时回退默认 SQLite 启动，并在管理页显示告警横幅提示配置异常

#### Scenario: 切换后启动失败自动回滚
- **WHEN** 后端重启后激活连接无法建立（如目标数据库宕机）且存在切换标记
- **THEN** 系统 SHALL 自动回滚到 `db_config.json.bak` 备份的旧配置并启动，确保服务可用

#### Scenario: 存在运行中任务时禁止切换
- **WHEN** 管理员尝试切换数据库且源库存在 running 状态的安装任务
- **THEN** 系统 SHALL 拒绝切换，提示"有任务正在运行，请等待完成或取消后再切换"，并列出运行中任务

#### Scenario: 切换时兜底标记运行中任务
- **WHEN** 切换执行瞬间检测到源库存在 running 状态任务（检查与切换之间进入 running 的竞态）
- **THEN** 系统 SHALL 将这些任务标记为 interrupted（历史记录保留在源库）后继续执行切换，确保任务不会永远卡在 running

#### Scenario: 切换成功即时展示重启指引
- **WHEN** 管理员在切换确认弹窗中确认且切换成功
- **THEN** 界面 SHALL 即时展示重启指引反馈（含具体重启操作，复用既有待重启指引文案），直至管理员完成重启或关闭指引

### Requirement: 直连流式迁移（B1）
系统 SHALL 支持在源数据库与目标数据库同时可达时进行直连流式数据迁移。迁移 SHALL 按表依赖顺序搬运数据、显式保留主键 ID 以维持外键关系、迁移后重置目标库自增序列。迁移为单向快照语义，仅支持替换模式，不支持合并模式。

#### Scenario: SQLite 迁移到 PostgreSQL（替换模式）
- **WHEN** 管理员选择"SQLite → PostgreSQL"、选择目标 PG 连接并开始迁移（替换为唯一模式，界面以危险标签明示）
- **THEN** 系统 SHALL 先自动备份源库、清空目标表，再按依赖顺序搬运全部表数据（含日志类表，除非用户取消勾选「包含日志数据」），保留原有 ID 与外键关系，完成后重置 PG 序列，进度通过任务中心展示

<!-- 2026-10-31 修正：原文「先备份目标库」与同需求「替换模式自动备份」场景（自动将源库导出为归档备份）矛盾；代码实据 database.py 迁移线程调用 `db_archive_service.export_archive(source, backup_path)`，备份对象为源库，统一为源库口径。 -->

#### Scenario: PostgreSQL 迁移到 SQLite
- **WHEN** 管理员选择"PostgreSQL → SQLite"并开始迁移
- **THEN** 系统 SHALL 将 PG 数据全量搬运到本地 SQLite，保留 ID 与外键关系，完成后本地库可直接单机使用

#### Scenario: 迁移到非空目标库需确认
- **WHEN** 管理员选择迁移到已有数据的非空目标库
- **THEN** 系统 SHALL 拒绝直接执行，弹出高危确认弹窗（展示源/目标标识与地址、目标库将被清空覆盖的警告、自动备份源库及保留最近 10 份说明），管理员在弹窗中确认后才可继续，确认后自动备份源库

<!-- 2026-10-31：确认交互由行内勾选框「我了解将清空目标库，先备份再替换」升级为高危确认弹窗（勾选框移除），备份对象口径同步修正为源库；场景标题为稳定标识符保持不变。 -->

#### Scenario: 迁移过程源库只读
- **WHEN** 迁移任务运行中
- **THEN** 系统 SHALL 只读取源库、不修改源库任何数据，迁移中断不影响源库

#### Scenario: 迁移期间写操作被锁定
- **WHEN** 迁移任务运行中，用户发起写操作（创建/修改/删除/发布）
- **THEN** 系统 SHALL 拒绝写请求并返回 503 维护中提示，迁移完成后自动解除锁定恢复写操作

#### Scenario: 替换模式自动备份
- **WHEN** 替换模式迁移开始（confirmed_clear=True）
- **THEN** 系统 SHALL 自动将源库导出为归档备份，迁移失败时用户可据此恢复

#### Scenario: 迁移到空库无需确认
- **WHEN** 管理员选择迁移到行数为零的空目标库
- **THEN** 系统 SHALL 直接执行迁移，无需额外确认

#### Scenario: 禁止迁移到当前激活库
- **WHEN** 管理员尝试将数据迁移到当前正在使用的激活库
- **THEN** 系统 SHALL 拒绝操作并提示「不能迁移到当前正在使用的数据库」

#### Scenario: 允许任意方向迁移
- **WHEN** 管理员选择任意两个不同的连接作为源和目标（SQLite→PG、PG→SQLite、SQLite→SQLite、PG→PG）
- **THEN** 系统 SHALL 允许执行迁移，迁移引擎不限制数据库类型组合
