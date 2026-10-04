# security-hardening-guardrails Specification

## Purpose

全栈代码审查（2026-10-04，报告 `docs/refactoring/code-review-2026-10-04.md`）P0/P1/P2 修复沉淀的横切安全与可靠性护栏：部署密钥链、事件循环纯度、事务纪律、守卫下沉、路径锚定、打包密钥配对、工件保留、双引擎一致性与凭据注入卫生。这些需求跨域生效，新增代码路径须对照本 spec 自检。

## Requirements

### Requirement: 部署密钥链 fail-fast

JWT 密钥（兼 Fernet 加密双角色）的部署 SHALL 满足：占位密钥 SHALL NOT 静默生效；生产环境缺失有效密钥 SHALL 启动失败。

#### Scenario: 占位密钥黑名单

- **WHEN** 密钥来源（环境变量 / EnvironmentFile / .env.production）为已知占位串（如 `your-production-secret-key`）
- **THEN** 系统 SHALL 拒绝将其视为有效密钥（黑名单校验）

#### Scenario: 生产环境缺密钥启动失败

- **WHEN** `APP_ENV=production` 且无有效密钥配置
- **THEN** 后端 SHALL 启动失败并给出明确指引（fail-fast），SHALL NOT 自动生成开发密钥

#### Scenario: service unit 经 EnvironmentFile 注入

- **WHEN** 部署模板渲染 systemd unit
- **THEN** 密钥 SHALL 经 `EnvironmentFile` 注入，unit 文件内 SHALL NOT 内联占位密钥字面量

### Requirement: 事件循环纯度

异步端点与服务 SHALL NOT 在事件循环内裸调已知阻塞方法（同步 httpx 串行请求、同步数据库引擎连接探测等）。

#### Scenario: 阻塞体卸载工作线程

- **WHEN** 异步代码需要执行同步阻塞调用
- **THEN** SHALL 经 `asyncio.to_thread`（或等价机制）卸载

#### Scenario: 纯度源码守卫

- **WHEN** 测试套件运行事件循环纯度守卫（黑名单：`fetch_edge_data`、`_verify_reachable`、`_do_test_sync`）
- **THEN** `backend/app` 内 async 函数体裸调清单内方法 SHALL 使守卫变红
- **AND** 新增阻塞方法 SHALL 同步补入黑名单

### Requirement: 事务纪律：外部 IO 前提交

同一请求内「先读库、再做长时间外部 IO（ansible/SSH/HTTP）」的端点 SHALL 在外部 IO 前 `await db.commit()` 结束事务（同时落审计骨架）。

#### Scenario: 长任务前置提交

- **WHEN** SSE 长流端点（edge.env 部署 / 自启动 / 集群安装等）通过前置校验并准备交出流
- **THEN** 端点层 SHALL 在交出 `StreamingResponse` 前提交事务（生成器体内的提交不满足本要求）
- **AND** 外部长 IO 执行期间并发写请求 SHALL NOT 被 SQLite 写锁阻塞成假 401

### Requirement: 守卫收敛于共享出口

跨资源安全/正确性守卫 SHALL 实现于共享出口而非各调用点，新增调用路径自动免疫。

#### Scenario: ansible 假成功守卫在 run_playbook 出口

- **WHEN** 任意调用方经 `run_playbook` 执行 playbook 且 ansible 以 rc=0 退出但输出含空匹配标记（'no hosts matched' 等）
- **THEN** `run_playbook` SHALL 判定失败并返回错误（`_ansible_false_success_error` 收敛于唯一出口）
- **AND** 调用方 SHALL NOT 各自实现该守卫

#### Scenario: EdgeClient 中继头与 403 转译在底层请求方法

- **WHEN** 任意请求方法（含 raw_put/raw_delete）经中继网关访问节点
- **THEN** 中继头（`X-Edge-Target`）注入与网关白名单 403 转译 SHALL 由共享助手（`_relay_aware_headers` / `_check_relay_whitelist_403`）统一处理
- **AND** 新增请求方法 SHALL NOT 遗漏中继头

### Requirement: 运行时路径 CWD 锚定

运行时读写的相对路径 SHALL 以 `__file__` 推导的 backend 根锚定，与进程 CWD 无关；源码守卫拦截新增的 CWD 相对路径字面量。

#### Scenario: 配置与数据路径锚定

- **WHEN** 后端访问 features.yaml、`.restart.flag`、edge 日志目录、迁移备份目录
- **THEN** 路径 SHALL 解析为 backend 根下的绝对路径（进程从任意 CWD 启动行为一致）

#### Scenario: 有意相对的显式豁免

- **WHEN** 某路径字面量有意保持 CWD 相对（如 `db_config` 默认连接的存储态——存储相对、解析期锚定以保证目录整体迁移可移植）
- **THEN** 该行 SHALL 携带 `cwd-relative-by-design` 标记，守卫跳过；无标记的相对路径 SHALL 变红

### Requirement: 打包密钥配对随包

离线打包 SHALL 保证 `.jwt_secret` 与 `db_config.json` 配对：携带加密连接密码的包 SHALL 同时携带加密密钥。

#### Scenario: gen-linux 打包携带 jwt_secret

- **WHEN** 执行 `product/linux/gen-linux.sh` 打包
- **THEN** 存在 `backend/data/.jwt_secret` 时 SHALL 拷贝至目标包（权限 600）
- **AND** 不存在时 SHALL 输出明确警告（目标机将重新生成密钥，包内已加密密码不可解）

### Requirement: 工件保留与版本表索引

只增不减的工件 SHALL 有保留策略；高频增长的版本表 SHALL 有查询复合索引。

#### Scenario: 导出任务内存收敛

- **WHEN** 用户反复触发系统级任务导出（CSV）
- **THEN** 进程内导出任务记录 SHALL 按保留上限（KEEP=100）收敛，SHALL NOT 无上限驻留内存

#### Scenario: 配置版本表复合索引

- **WHEN** 存量库启动且 `ps_config_version` 缺少 `(cluster_id, resource_type, resource_id)` 复合索引
- **THEN** 迁移 SHALL 经 `_ensure_index` 自动补建（新库由模型 `__table_args__` 声明）

### Requirement: 双引擎连接一致性

async 与 sync 引擎 SHALL 保持一致的 SQLite 连接 PRAGMA（外键强制、WAL、busy_timeout）。

#### Scenario: async 引擎外键 PRAGMA

- **WHEN** async 引擎建立新连接
- **THEN** 连接监听 SHALL 执行 `PRAGMA foreign_keys=ON`（与同步引擎对齐）

### Requirement: SSHPASS 子进程级注入

SSH 密码 SHALL 经子进程环境（`env_extra`）注入到具体 spawn 点，SHALL NOT 写入父进程全局环境。

#### Scenario: 密码不进进程环境

- **WHEN** 密码腿 spawn ssh/ansible 子进程
- **THEN** 密码 SHALL 仅出现在该子进程的环境变量中
- **AND** 后端父进程 `os.environ` SHALL 保持干净（契约测试钉死）

### Requirement: 登录限速与密码版本吊销

登录接口 SHALL 对连续失败实施固定窗口限速：以（用户名，客户端 IP）为键在进程内统计 10 分钟窗口内的失败次数，窗口内失败达 5 次 SHALL 以 429 拒绝后续尝试，窗口过期自动放行，登录成功 SHALL 清除该键计数。用户密码变更后 SHALL 递增 pwd_ver 版本号，全部改密前签发的 JWT 在后续请求鉴权时 SHALL 因版本不匹配被吊销。

#### Scenario: 固定窗口失败限速

- **WHEN** 同一（用户名，IP）组合在 10 分钟窗口内连续登录失败达 5 次后再次尝试登录
- **THEN** 登录接口 SHALL 返回 429 拒绝，即使凭据正确
- **AND** 窗口过期后 SHALL 自动放行，计数不无限累积

#### Scenario: 登录成功清除失败计数

- **WHEN** 某键存在失败计数且该用户随后登录成功
- **THEN** 该键的失败计数 SHALL 被清除，不影响后续正常登录

#### Scenario: 改密后旧令牌吊销

- **WHEN** 用户修改密码后持改密前签发的旧 JWT 访问受保护接口
- **THEN** 鉴权 SHALL 因 pwd_ver 不匹配拒绝该令牌（401）
- **AND** 不存在「改密后旧 token 仍可用」的窗口
