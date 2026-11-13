# 磐石 Gateway — AI 代理指南

> **元规则**：本文件与代码冲突时，以代码为准，并同步修正本文档相应条目。

## 领域模型

磐石 Gateway 是多集群 Edge 网关（OpenResty）统一管理平台。新功能先定位到对应域，再按命名约定落位：

- **集群配置域**：集群 / 路由 / 上游 / 插件 / SSL 证书 / 节点 / DNS 代理 / 流代理 / 全局规则，配置发布推送到 Edge 节点
- **自动化域**：Ansible 主机清单与自动化部署（OpenResty 安装、节点任务执行）
- **观测域**：指标采集（ClickHouse）、仪表盘、健康统计
- **运维域**：Edge 节点直连与数据导入、集群备份/恢复/导出（JSON/Excel）、数据库管理、用户与认证

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | FastAPI + async SQLAlchemy 2.0 + Pydantic v2 |
| 认证 | JWT（python-jose）+ bcrypt |
| 自动化 | ansible-runner / ansible-core |
| 指标 | clickhouse-driver |
| Excel 导出 | openpyxl |
| 前端 | Vue 3（Composition API）+ TypeScript + Ant Design Vue 4 + Pinia + Vue Router |
| 前端可视化/编辑器 | ECharts、Monaco Editor、json-editor-vue |
| 构建 | Vite（前端）/ uv（后端 Python） |
| 测试 | pytest + pytest-asyncio（后端）；Vitest（单元）+ Playwright（E2E）（前端） |
| 数据库 | SQLite（开发，`backend/data/`） |

## 常用命令

```bash
# 📌 开发启动（一键启动前后端）
develop/linux/start.sh                # 后端 → 12344，前端 → 12345
develop/linux/stop.sh                 # 停止

# 后端测试
cd backend && uv run pytest

# 前端 E2E 测试
cd frontend && npx playwright test

# 前端单元测试
cd frontend && npx vitest run

# 前端构建
cd frontend && npm run build

# 手册截图（Playwright 直连，直接写入 docs/user-manual/images/）
cd frontend && node scripts/manual-screenshots.mjs [--only 00-01-login] [--out /tmp/shots]

# 默认登录
# admin / panshi123 访问 http://localhost:12345
```

## 端口

| 服务 | 端口 | 说明 |
|---|---|---|
| 后端 | 12344 | `develop/linux/start.sh` 指定 |
| 前端 | 12345 | start.sh 指定 |
| E2E Vite | 9100 | Playwright 自起第二个 dev server（baseURL=http://localhost:9100），代理 /api 到 12344 |

Vite 代理将 `/api` 请求转发到 `localhost:12344`（读取 `backend/.port` 文件，缺省 12344）。

**日志位置**：应用日志 `backend/logs/app.log`（level=INFO，RotatingFileHandler 10MB×5，行内含 `[request_id]`，响应头 `X-Request-ID` 可与日志互查）；uvicorn 访问/stdout `backend.log`、前端 `frontend.log`（仓库根，start.sh 重定向）。E2E spec 内直接调 API 用前缀 `/api/v1`（勿用 `/api`），且须先登录取 token 带 `Authorization` 头（2026-08-29 起全部要求鉴权）。

## 国内网络环境（重要约定）

**本机位于中国网络环境，下载任何国外软件包/依赖/二进制文件必须优先使用国内镜像源，否则极慢或超时。** 每次安装/下载前先检查是否可换用国内源：

| 场景 | 国内源配置 |
|---|---|
| npm 包安装 | `npm config set registry https://registry.npmmirror.com`（或 `--registry=` 单次指定） |
| pip / uv 包安装 | `uv pip install --index-url https://pypi.tuna.tsinghua.edu.cn/simple` 或 `pip config set global.index-url` |
| **Playwright 浏览器下载** | `PLAYWRIGHT_DOWNLOAD_HOST=https://cdn.npmmirror.com/binaries/playwright npx playwright install chromium`（或 `PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright`） |
| apt 系统包 | 使用清华/阿里源（如 `mirrors.tuna.tsinghua.edu.cn`、`mirrors.aliyun.com`） |
| GitHub 下载（releases/源码） | 使用 `https://ghproxy.com/` 或 `https://mirror.ghproxy.com/` 前缀代理，或 `https://hub.fastgit.org` |
| Maven / Go / Rust 等 | 分别用阿里云 Maven、`GOPROXY=https://goproxy.cn`、`https://rsproxy.cn`（crates.io 镜像） |

**注意**：
- 不要默认直连 `registry.npmjs.org`、`pypi.org`、`playwright.azureedge.net` 等国外源
- Playwright 安装浏览器时若卡住，先 `Ctrl+C` 中断，改用 `PLAYWRIGHT_DOWNLOAD_HOST` 国内镜像重试
- 环境变量可在命令前内联设置（临时生效），无需修改全局配置

## 项目结构

目录树只列稳定骨架；具体文件用 glob 查看，不要依赖枚举。

```
backend/
  app/
    api/v1/      # REST 路由。命名约定：cluster_*.py = 集群域资源（路由/上游/节点/SSL/插件等，
                 #   按资源一文件）；无 cluster_ 前缀 = 全局/平台级（auth、users、ansible_inventory、
                 #   metrics、database、nodes、edge_client、edge_import、system 等）
    core/        # 数据库引擎、安全配置、seed（默认账号）
    models/      # SQLAlchemy ORM 模型
    schemas/     # Pydantic 请求/响应结构
    services/    # 复杂业务逻辑（ansible_service、inventory_service、metrics_service、
                 #   clickhouse_client、cluster_backup、db_archive/migration/switch 等）
    config/      # YAML 配置（equivalence_rules.yaml 字段等价规则、clickhouse.yaml）
    utils/
  tests/         # pytest 测试
  data/          # SQLite 数据库与运行时数据（全部不入库）
frontend/
  src/
    api/         # Axios 客户端，按资源拆分模块（ansibleInventory.ts、ssl.ts、streamProxy.ts 等）
    components/  # 通用组件（PluginEditorDrawer.vue 插件双模式编辑器、VersionManagementModal.vue 等）
    views/       # 页面级组件；views/clusters/ = 集群子页 Tab
    composables/ # useCluster*.ts 可复用 CRUD 逻辑；useClusterUtils.ts = 共享发布/删除工具
    router/      # Vue Router
    stores/      # Pinia
    types/  assets/  styles/  utils/
  e2e/           # Playwright spec（在 frontend/e2e/，不在 src 下）
deployment/      # systemd 服务文件
develop/linux/   # 开发启动/停止脚本
develop/windows/ # Windows 版（PowerShell）
docs/            # 设计文档、Edge API 参考（docs/edge/*.log 为 API 示例）；docs/refactoring/ = 重构治理文档（见约定 #12）
openspec/        # 变更工件；openspec/specs/ = main specs
.opencode/skills/  .opencode/command/   # AI 工具配置
```

## 关键约定

1. **登录输入框必须保留 `id` 属性** — Playwright 测试依赖 `#username` 和 `#password` 选择器（`frontend/src/views/Login.vue`），切勿删除或改名。
2. **后端入口为 `app.main:app`** — 不是根目录的 `main:app`。
3. **数据访问直连模式** — 简单 CRUD 直接在 route handler 中用 SQLAlchemy 执行（`select()` / `execute()`），不建 Repository 层；仅复杂业务逻辑（Ansible、备份、指标等）放 `services/`。`backend/app/repositories/` 已不存在，不要重建。
4. **插件编辑器支持双模式** — 表单编辑和 JSON 编辑都支持（`PluginEditorDrawer.vue`），不可移除任一模式。
5. **代码禁止 `as any`、`@ts-ignore`、`@ts-expect-error`** — 生产代码已清零（存量 74 处已于 2026-08 清理）；测试文件（`__tests__/`、`*.test.ts`、`*.spec.ts`）豁免，mock 场景允许。
6. **前端 API 按资源拆分模块** — 新资源在 `frontend/src/api/` 建对应 `.ts` 模块，不要往单文件里堆。
7. **发布/删除流程统一** — 使用 `useClusterUtils.ts` 中的 `executePublish` 和 `executeDeleteWithProgress` 共享函数，不要在 composable 中重复实现进度弹窗逻辑。
8. **测试运行时服务已启动** — 开发环境前后端（后端 12344 / 前端 12345）默认已在运行，不要自行启动/停止。验证链路直接连 `http://localhost:12345`（前端）与 `http://localhost:12344`（后端）。仅当 curl 健康检查失败时才用 `develop/linux/start.sh` 启动、`develop/linux/stop.sh` 停止。手动链路测试（Playwright）优先复用已运行实例，完成后不停止系统。
9. **界面语言为中文内联文本** — 所有 UI 文案直接写中文，不引入 i18n 库。
10. **清单与自启动模块禁止密码脱敏** — Ansible 主机清单（`GET /inventory`、`POST /inventory/parse`）与自启动管理（走 `get_ssh_password` 读清单文件）依赖真实 SSH 密码，**不得对 `ansible_ssh_pass`/`ansible_become_pass` 做任何掩码/脱敏**。历史教训（2026-08）：Phase 6 曾给 parse 加掩码，`******` 占位被表格模式保存时**写回 inventory/host 文件本体**，真实密码被覆盖且不可恢复，两个模块功能全挂；已在 commit c88aa26 彻底移除该机制。清单密码明文返回（前端 `a-input-password` 展示），真实密码备份在 `backend/ansible/inventory/backups/`。
11. **`useClusterUtils.ts` 维持单文件、禁止按职责拆分** — 承 #7：它是发布/删除/批量弹窗的单一实现，其价值在于单点可发现性（LLM 一次 read 即得完整上下文），拆成多文件反而增加漏读与间接层成本（它是 Phase 4 合并产物）。本仓库主要由 LLM 维护，文件切分维度是"会话读取的原子单位"而非"职责哲学分类"——任何"大文件=坏味道"的重构直觉先按此判据复核。重启拆分的触发条件见 `docs/refactoring/refactoring-plan-2026-08-30.md` R1 决策记录（突破 ~1500 行 / 出现零共享代码的新职责 / 实际发生连读 3+ 文件才敢下笔的定位成本）。
12. **重构治理文档统一放 `docs/refactoring/`** — 重构方案（`refactoring-plan-*.md`）、代码评审报告（`code-review-report*.md`）等治理类文档一律写入该目录，**不得散落在 `docs/` 根**（根目录只留 user-manual、architecture 等长期文档）。新会话产出重构计划前先确认此归属。
13. **经验与规则沉淀一律写本文件，不用 magic-context memory** — 需要"防未来会话犯错"的规则/教训（原 ctx_memory 类）直接追加到本文件关键约定或相应节；ctx_memory 仅用于尚未成熟、值得观察的临时偏好。决策论证类长文落 `docs/` 对应文档，本文件只放一行规则+指针。
14. **排查"写库不生效/数据陈旧"先查活动数据库** — `backend/db_config.json` 的 `active` 连接决定运行时库，可被"数据库管理"功能切走（2026-08-30 实测 active 长期为 `./data/manual-demo.db` 而非默认 `./data/panshi.db`）。直连 SQLite 取证前必须先确认 active，曾连续两轮误诊"写库静默失败"（实为读错副本库），真实 bug 另在其因（修复于 commit 23a94f9 覆盖逻辑）。
16. **新功能/缺陷修复走 TDD** — 先写失败测试（RED）并验证失败，最小实现（GREEN）验证通过，再重构；openspec 变更的 `tasks.md` 逐项打勾推进。
17. **集群 JSON 备份/导入为 clone-only 单向语义** — 丢弃全部平台 ID、由库分配新 ID、FK 经插入期捕获的旧→新映射重建（主键全库唯一，保号导入必撞车；`stream_proxies.ref_node_id` 随 nodes 重映射；Node 表无 name 字段，备份/还原以 `ip+service_port` 为节点身份键）。导入总是新建未发布集群（status=1，需手动发布）；目标名须过 NAME_PATTERN 且查重先于任何写库。整库还原走"数据库管理"功能，勿造保号模式。**UI 术语用「导入」不用「恢复」**（central-management-ux-review-fixes：恢复≠新建，且与版本回滚撞词）。导入不迁移运行态发布状态（`last_publish_ok/last_publish_detail/last_published_at` 清空），时间列经模型感知矫正（`_coerce_datetime_fields` 按类修，cluster-backup-restore-fix）；导入失败回滚不留孤儿文件、错误转译中文段位。
18. **发布/版本/回滚编排单实现** — `edge_sync.publish_resource()` / `list_config_versions()` / `delete_config_version()` 是所有集群域资源的唯一实现，资源差异用参数表达（post_version_hook、prefer_display_name、日志字段），禁止逐资源复制。`backend/tests/test_publish_response.py` 是**源码模式守卫测试**（正则检查 publish 函数体），把响应构建/版本返回搬离原位时必须同步更新该守卫。**同模型双形态资源（stream_proxy/dns 代理共用 StreamProxy 表）的 rollback restore_fn 白名单按域校准（2026-10-26 教训）**：DNS 代理回滚白名单曾漏 `dns_config`/`checks`——快照全量含这两列、发布却从存活行读它们，回滚后发布推的仍是「最新内容」（用户报告实锤）；已修为 DNS 全量恢复（`test_dns_proxy_rollback.py` 钉死），四层代理保持 D3 已批的部分恢复语义（弹窗范围说明）。新增 StreamProxy 列时须同时核对两个域的恢复范围。
19. **权限与审计统一方案** — 全部 API 端点必须挂鉴权/权限依赖，两种形态并存：`APIRouter()` 声明处 `dependencies=[Depends(get_current_user)]`（`cluster_*.py` 等），或端点函数参数 `Depends(require_permission(resource))`（`database.py`、`ansible_inventory.py`、`cluster_backup.py`、`clusters.py` 根端点等）；仅 system/features 与 /health 有意公开。资源级门控用 `deps.py` 的 `require_permission(resource)` / `require_any_permission(*resources)` 工厂（admin 直通；`cluster_*` 子资源由 clusters 容器权限门控）。**新增/修改路由必须在 `tests/test_security_guard.py` 的 UNAUTHENTICATED_SAMPLES 补采样**（2026-09 教训：采样漏掉 `/clusters` 根路径导致 5 端点匿名可访问）。**新增可路由资源须双端注册权限键**（后端门控 + 前端权限 keys，对齐左侧菜单分类——分类集合以 AppSidebar navSections 现文为准，勿引用本文件旧清单）。**前端权限键的勾选分组/标签单一事实源 = `src/config/permissionGroups.ts`**（UserList 消费；守卫测试 `permissionGroups.source.test.ts` 解析 AppSidebar.vue 源码强制组序/组归属/键覆盖同步——改侧边栏菜单的分组、条目或权限键后，该测试红即需同步 PERMISSION_GROUPS，2026-10-30 用户实测菜单批 9 改版后权限区漂移）。操作审计走 `services/audit.py` 的 `log_audit`（写 sys_audit_log），查询端 `GET /system/operations`（管理员）。认证流式端点必须 fetch 流式带 Authorization 头（原生 EventSource 不能加 header）。后端鉴权测试复用 `tests/api_helpers.py`（AuthedTestClient，seed admin id=1）。
20. **JWT 密钥解析链**（`app/core/security.py`）— 显式 `JWT_SECRET_KEY` 环境变量 → `.env.<APP_ENV>` 中非占位值 → `APP_ENV=production` 无配置即启动失败 → 开发自动生成并持久化 `backend/data/.jwt_secret`。注意：该 key 同时是 `db_config.py` 的 **Fernet 密钥**（数据库连接密码加密），换 key 会使已存密码不可解。
21. **Ansible 执行两条铁律** — ① `run_playbook` 必须显式传 `inventory=<inventory/host 文件>`（ansible-runner 对 inventory/ 目录是递归扫描，遗留 .bak 会被当主机源解析报 "Invalid host pattern 'all:'"）；备份统一在 `inventory/backups/`。② rc=0 ≠ 执行成功：ansible 对空匹配（节点不在清单，'no hosts matched'）以 rc=0 退出，判定前必须扫描输出标记——false-success 守卫见 `node_task_service._ansible_false_success_error` 与 cluster_edge_env 部署/读取流。**守卫标记集已收窄（2026-11-05 真实事故）**：只认「no hosts matched / could not match supplied host pattern」+「UNREACHABLE! / "unreachable": true」四类 ansible 特有 token；**timeout/权限/磁盘等宽泛子串不得用于翻转 rc=0**——edge_read_env 腿的 stdout 就是 edge.env 文件内容，配置里 `resolver_timeout: 5` 曾被「timeout」标记误判成执行超时，成功读取报「读取 edge.env 失败」（载荷关键词与守卫标记重叠即必现，回归 `tests/test_ansible_service.py::TestFalseSuccessGuardPayloadKeyword`）。宽泛归因仍在 `classify_ansible_failure` 的 rc≠0 路径。
22. **Edge 网关 URI 透传，不做裸路径兼容** — APISIX 类 radixtree 下 `X/*` 不匹配裸 `X`（只匹配 `X/` 及子路径），WebSocket 客户端须连带斜杠的 `/ws/`；`convert_route_to_edge_format` 仅透传 uri，补兼容曾评估后**决定不做**（用户决策）。
23. **字段名错位仅两处，序列化按 mapper 读列名** — `SslCertificate.private_key` 对应 DB 列 `key`（`_serialize` 输出 dict 键用 `attr.columns[0].name`、取值用 `attr.key`）；`StreamProxy.timeout` 列型为 TEXT（备份保字符串原样如 `"15"`）。其余模型名一致。
24. **前端 CRUD 一律基于工厂** — `useClusterResourceCore.ts` 是删除/发布/版本/选择十件套的唯一实现（selection 访问器参数化）；分页资源用 `useClusterResource`，插件实体（plugin_configs/global_rules）用 `useClusterPluginEntity`——两者是薄适配层。`VersionModalState` 单定义于 core、两文件重导出。新资源 composable 禁止复制删除/发布/版本逻辑。
25. **弹窗三层制** — 普通确认/信息 → `useOverlayModal`（showOverlayModal，手写 modal-overlay，全站 Modal.confirm 已清零）；删除/发布进度等共享流程 → AppModal（`components/AppModal.vue` + useClusterUtils 的 5 个共享弹窗）；视图级内联弹窗保持手写 modal-overlay。例外：EdgeImport/UserList/AnsibleInventory 三页保留 a-modal（品牌色头部）。教训：Vue 属性内多语句 `a; b` 会被 prettier 重排破坏编译——须提取为函数调用；**`vue-tsc -b` 不报此类模板编译错**（2026-09-17 实测：commit 时 lint-staged 的 prettier 触发重排，仅挂载类 vitest 暴露，全量跑曾 50 用例连挂），多语句 handler 一律提取为 script 函数。
26. **日期/文件大小格式化只用 `utils/format.ts`** — formatDate（dash）/formatDateTime（slash 含秒）/formatMonthDayTime/formatDateOnly/formatPublishDateTime(Asia/Shanghai)/formatFileSize；禁止视图内再写本地 formatDate（Phase 1 已消除 12 处重复）。**后端时间列一律 `datetime.utcnow` 存储（naive UTC，isoformat 无时区后缀），前端展示必须走 utils/format.ts——其 `parseBackendDate` 将无后缀字符串按 UTC 解析、按 Asia/Shanghai 展示；禁止视图内 `new Date(t).toLocaleString()` 直读后端时间**（2026-09 教训：naive UTC 被当本地时间解析，全站时间显示少 8 小时）。模板内需要全角空格 U+3000 时写实体 `&#x3000;`（prettier 会破坏裸字符及注释位置）。
27. **前端工程化管线** — ESLint 10 flat config（vue3-essential + typescript-eslint；`no-explicit-any`/`no-unused-vars` 为 warn 级）、Prettier（无分号/单引号/120 宽）、husky 9 + lint-staged（`.husky` 在 frontend/，已配 `core.hooksPath`；pre-commit 自动 fix 暂存文件）。`types/index.ts` 中动态 JSON 的 `Record<string, any>` 为有意豁免（带 eslint-disable 注释）；`.vue` 模板层 ~474 处存量 any warn 走增量治理，**不开专项清理**（全量回归 UI 的 ROI 为负）。**类型验证用 `npx vue-tsc -b`（构建模式，走 tsconfig references）**——`vue-tsc --noEmit` 会漏检部分文件（2026-09-16 实测：误删的类型引用只被 `-b` 捕获）。另：本仓库**无分号**，脚本若按 `;` 判定类型别名结尾会误删其后声明。
28. **数据库归档/导出代码必须双方言感知（SQLite/PostgreSQL）** — `db_archive_service` 归档的 `ddl/` 成件是 best-effort 元数据（仅 SQLite 源提取 sqlite_master DDL，非 SQLite 源返回空串，全仓库无消费方，导入不依赖）；PG 源经 psycopg2 裸 `text()` 查询返回 `datetime`/`Decimal` **对象**（SQLite 返回字符串，测试因此测不出），行序列化必须走 `_serialize_row`（`default=str`）。守卫测试 `backend/tests/test_db_archive_service.py`（TestGetDdlDialectGate/TestSerializeRow）；真 PG 回归用 `PG_DSN` 环境变量 opt-in（`test_sqlite_to_pg_migration.py` 同款模式）。2026-09 教训：PG 源导出曾在第一张表即报 `relation "sqlite_master" does not exist`。
29. **端点让 service 自建会话写库时必须贯穿 `get_db` 会话** — audit 钩子（路由级依赖）在 `get_db` 会话 A 上 add 审计骨架，`get_current_user` 随后在 A 上 SELECT 触发 **autoflush → A 持 SQLite 写锁直到请求结束**；若 handler 里 service 再开第二会话写库（如曾 `NodeTaskService.retry_task` 内 `_reset_failed_items` 自建会话），会被阻塞至 busy_timeout → `database is locked` → 500。修复：端点注入 `db: Depends(get_db)` 并作为参数贯穿 service（`retry_task(task_id, node_ids, db=db)`）。带 `db` 参数的端点（create/delete 等）不受影响。守卫测试 `TestRetrySessionThreading`（文件库双引擎复现自锁）。另：async 引擎已挂 `_configure_sqlite_connection`——监听器挂在 `engine.sync_engine` 的 connect 事件上（aiosqlite 经 greenlet 适配，`database.py::build_async_engine_for`），WAL/FK/busy_timeout 与同步引擎同款（M26 修复），勿再当缺口立项。**推论（2026-09-22 中继网关初始化实测）**：任何「同一请求内先读库、再做长时间外部 IO（ansible/SSH/网络）」的端点，若期间不结束事务，审计骨架写锁会横跨整个 IO 期 → 并发写请求 `database is locked` 被 `get_current_user` 吞成 **假 401「未认证」**（实测：init 运行 38s 内并发 PUT 5s 后 401；test.db 文件库）。且 handler 不 commit 时审计记录随会话回滚丢失。修复范式：**外部 IO 调用前 `await db.commit()` 结束事务**（同时落库审计），实现见 `relay_init.init_region` / `relay_push.push_region`；回归测试断言 ansible 执行瞬间 `db.in_transaction() is False`。前端对此类长接口须按请求覆盖 axios 全局 `timeout: 30000`，否则客户端在服务端仍执行时中止，UI 表现为「初始化中…」后误报 timeout。**中继长任务最终方案（2026-09-22，用户确认，二次调整为 SSE）**：`relay init/push` 走 **SSE 流式**（与节点安装同模型）：端点前置校验（区域/前缀/网关清单）后在请求会话内渲染配置并 `commit`（同时落审计 + 释放写锁），再返回 `StreamingResponse(_region_stream(...))`，流由 `relay_init.stream_init_region` / `relay_push.stream_push_region` 产出；ansible 经 `ansible_service._stream_ansible_events`（通用 queue+event_handler 核心，`_run_ansible_stream` 亦委托它）输出 `{line,percent}` 与终态 `{rc,status,hosts_pattern,listen_port}`。前端复用 `NodeExecutionResultDrawer` + `useInstallStream`（地址来自 `relayInitStreamUrl/relayPushStreamUrl`），实时显示 stdout 行/进度/用时。同区域并发守卫在 `relay.py` 的 `_INFLIGHT` 集合：端点 acquire→409，流的 `finally` release（规则 #33：finally 只做同步操作）。**不再使用任务注册表/轮询**（短暂采用的 `relay_jobs.py`/`utils/relayTask.ts` 已删除）。端点交出流前必须 `await db.commit()` 落审计骨架（回归 `test_init_trigger_is_audited`）。`relay_health.check_region/check_all` 已拆分「串行读库 → commit → 并发纯网络探测」，读事务不再横跨探测；守卫测试断言探测/ansible 瞬间 `db.in_transaction() is False`。`relay_push.yml` 与 `relay_init.yml` 同为网关机非特权用户：**`become: false` + `gather_facts: false`**，nginx 路径由 `openresty_prefix` 推导（不得用 `/etc/openresty` 等需 root 的系统路径）；`relay_push.yml` **内联的 sshd 腿仍暂缓**（`relay_sshd_enabled=false`），push 只下发 nginx 白名单；**网关 sshd 跳板转发现有独立 root 通道**：`POST /relay/gateways/{id}/sshd-setup`（界面「配置跳板转发」）→ `relay_sshd.yml` 以 root 直连 SSH 写 `/etc/ssh/sshd_config.d/relay-tunnel.conf`（`AllowTcpForwarding yes` + `PermitOpen`，由 `relay_push.render_sshd_dropin` 渲染）——**改前备份 + `sshd -t` 语法校验 + `sshd -T` 生效性验证 + 失败自动回滚 + 仅 reload**（网关 sshd 禁转发时跳板查询必报 `administratively prohibited`，实测）；root 凭据经 `relay_sshd.inject_gateway_creds` 行级临时注入网关清单、流 `finally` 还原（不落库/不进命令行，与自启动同款；回归 `test_stream_injects_root_creds_then_restores`）。 **PermitOpen 格式有厂商差异（2026-09-22 实测）**：① 重复 `PermitOpen` 行只有**首个目标**生效（其余 `channel 0: open failed: administratively prohibited` rc=255）；② 标准 OpenSSH 用**单条逗号分隔**，但 **LinxOS 的 sshd 不接受逗号**（`sshd -t` 报 `bad port number in permitopen`）→ `relay_sshd.yml` 首选逗号格式，`sshd -t` 失败即**回退为仅 `AllowTcpForwarding yes`**（`render_sshd_dropin(include_permitopen=False)`），并回显原因；两种格式都失败才回滚。跳板只在**运行期**以 `ansible_ssh_common_args` 注入节点清单（故 `ansible-playbook` 命令行/界面「执行命令」原本看不出是否走中继）；`run_playbook` 现会把 `# [中继] 经跳板 …` 追加到展示用 command，可用 `grep ansible_ssh_common_args inventory/host` 在运行中复核。且 SSH **管理**白名单用 `_region_nodes(enabled_only=False)` 含全部节点（禁用节点仍需状态查询/节点任务），nginx **流量** map 仍只含 `status==1`（语义不同，勿合并）。守卫测试 `test_push_playbook_is_unprivileged_and_defers_sshd`。另有只读 `GET /relay/gateways/{id}/config-preview`（界面「查看配置」）：用与下发**相同的渲染函数**产出待写入文件（`relay_8443.conf`/`edge_targets.conf`/nginx include 片段/sshd 跳板配置），供复制与 ansible 不可用时手工配置兜底。**总开关已从 `EDGE_RELAY_ENABLED` 环境变量迁到 `features.yaml` 的 `features.relay_gateway`**（显式 opt-in 默认 `false`，不沿用 features.yaml"未列出即启用"约定；`relay_registry.relay_enabled()` 经 `app.core.features` mtime 热加载，改完即时生效免重启）；注册表 CRUD 后必须 `await relay_registry.ensure_fresh(force=True)`——**仅 `invalidate()` 不生效**（同步读取方 `route_for_ip/route_for_cluster` 不判 TTL，会等到重启才生效，2026-09 修复，见 `relay.py::_refresh_routing`；`invalidate()` 现同时丢弃快照，读取方在下次 `ensure_fresh()` 前回退直连）。**SSH 自跳守卫**：`relay_registry.ssh_jump_for_ip(ip)` 在跳板主机 == 目标主机时返回 None——网关机同时被当作该集群业务节点时（aoh 网关 `jboss@192.168.0.13` 与节点 `192.168.0.13`），经自己去连自己会让 ssh 报 `jumphost loop`，实测表现为 rc=4 `Connection closed by UNKNOWN port 65535`；该 ip 改走直连即可恢复（回归 `test_self_jump_host_is_skipped`）。**测试注意**：部分 relay-off 用例（`test_ssh_conn_failure_no_retry_when_relay_off`、`test_run_ssh_fallback_non_auth_error_does_not_retry`）必须显式钉住 `relay_enabled`，**不得依赖部署 `features.yaml` 的取值**（开发环境把 `relay_gateway` 打开会让它们变红）。跳板专用账号/密钥为**建议**（非强制）：`_relay_key_args()` 仅在密钥文件（`~/.ssh/relay_ed25519` 或 `EDGE_RELAY_SSH_KEY`）**存在时**才注入 `-i`，缺失则省略并回退平台默认身份/config/agent（实测网关接受平台默认 `id_ed25519`，不报错、不污染回显）。现实部署形态「普通账号 + 默认密钥/清单密码」受支持；专用 `tunnel` 账号 + 只放公钥 + `PermitOpen` 白名单属安全加固建议，可能无法落地。
30. **测试套件治理基线** — pytest 已配 `--timeout=90`（pyproject）；`tests/api_helpers.py` 的 `isolated_app_lifespan()` 用于隔离 lifespan 真实库/后台服务交互；`_no_edge_http` 模式（autouse mock EdgeClient 网络）杜绝测试真实网络 IO。全量审计见 `docs/refactoring/test-suite-consolidation-2026-09-12.md`。禁新增：`assert callable/hasattr` 型零价值用例、跨文件复制同行为用例（单字段变体一律 parametrize）。**✅ 2026-09-17：测试引擎已全局隔离，全量 pytest 可放心跑** —— `tests/conftest.py` 在**导入期**把 `app.core.database` 的 `_async_engine`/`AsyncSessionLocal`/`create_sync_engine`/`_active_async_engine`/`_reload_active_engine` 单点重定向到会话级隔离库，并按对象身份清扫 `sys.modules` 中**按值导入**的陈旧引用（`app.main`、`app.api.v1.database` 等）。**两种后端**：默认 `sqlite`（临时文件，全量 1622 passed / 0 failed / 3:19，真实库零接触）；`TEST_DB_BACKEND=pg` 走真实 PostgreSQL 的**夹具族 schema 组**（global=`panshi_test`/td/app/async/misc，DSN 取 `PG_DSN` 或活动 PG 连接，导入期建模板、每用例 DELETE+序列复位、会话结束全部 DROP；实测全量 1621 passed / 1 flake(并发时序，单跑即绿) / 26:06）。
**PG 模式六条铁律（2026-09-18 事故血泪，违反任一都会出事）**：
① 引擎 search_path **禁止带 public 兜底**——缺表时无限定 SQL 会解析到 public 真实表（曾因此清空全部真实数据，靠源 test.db 重迁恢复）；
② create_all 必须临时挂 `Base.metadata.schema=<族schema>`（限定 DDL），否则 has_table 误判"表已存在"静默跳过建表；
③ 会话 setup 前 `import app.main` 注册全部模型，否则 metadata 残缺；
④ 该 PG 存储每条 DDL/TRUNCATE 都强制 fsync（DataFileImmediateSync，秒级/条）→ 每用例复位用**单 roundtrip 多语句 DELETE**（0.1s）+ DO 块 setval 对齐 `max(id)+1`，模板建表放**导入期**（不占用例 90s 超时预算）；
⑤ 显式 id 种子不推进 PG 序列 → **种子后必须 setval 复位**（SQLite rowid 取 max+1 天然免疫，PG 会撞 pkey）；
⑥ get_db override 必须**用工厂每请求新开会话**——把异步 fixture 的 session 对象直接塞给同步 TestClient，asyncpg 连接跨 loop close 会 RuntimeError/泄漏。
**public 零污染守卫**：会话首尾对 public 全表行数快照断言，任何污染立即报错（conftest `_pg_public_row_snapshot`）。
**product 侧连带修复**：`SslCertificate` 时间默认值 aware→naive utcnow（PG 下创建 SSL 证书曾必 500）；`enrich_audit` 非整型 resource_id（如 ClickHouse "ck_xxxx"）折进 detail（同 #48 类）。
**本机测试 PG（2026-09-18 起推荐，实测对照）**：远程 192.168.100.90 全量 26 分钟的主因是连接建立 ~180ms/次（远端 fork 后端进程）+ 网络往返（提交本身仅 8ms，synchronous_commit 开关几乎无差）。本机 PG 全量 **4 分多**（远程的 1/6）：
- 原生 apt PG16：`postgres/postgres@localhost:5432`（默认集群 16/main）；docker：容器 `panshi-test-pg`（postgres:16-alpine，`postgres/postgres@localhost:15432`，daemon.json 已配 daocloud 镜像源）。二者性能打平（4:12 vs 4:29）。
- 跑法：`PG_DSN=postgresql://postgres:postgres@localhost:5432/test_panshi TEST_DB_BACKEND=pg uv run pytest`（docker 把 5432 换 15432、库名 test_panshi）。设置 PG_DSN 会额外激活 8 个 PG-gated 用例（`test_sqlite_to_pg_migration.py` 全部 + `test_db_archive_service.py::TestPostgresSourceExport`）——这些用例**硬编码契约** `postgres/postgres@localhost:5432/test_panshi`（空库自给自足、用后自清理）。
- **`migrate_direct` 直调必须传 `wait_post_copy=True`**：其序列复位/补列在后台 daemon 线程执行、函数即时返回（为 SSE 不卡 complete 而设计，生产由 finalize 收尾串行化）；直调方不等线程就发起下一次迁移，DROP ... CASCADE 会与线程互锁死锁（2026-09-18 实测）。逐文件迁移路线（原 45 文件清单）已废弃；需验证真实引擎构建器行为时用 `real_create_sync_engine` 夹具。设计见 `openspec/changes/test-suite-global-db-isolation`。同会话内测试间数据串扰仍存在（与改造前等价），需强隔离时另立项。
31. **PG 方言冒烟必跑（触发式）** — 凡改动触及 **schema/迁移/写库路径**（新增或修改模型列、raw SQL、JSON→TEXT 字段序列化、审计 path param 提取、dialect 敏感逻辑）时，合入前必须跑：
   `cd backend && TEST_DB_BACKEND=pg uv run pytest tests/test_pg_dialect_smoke.py -q`
   该套用例（`tests/test_pg_dialect_smoke.py`）覆盖三类真实事故：① 审计骨架 path param `str`→Integer（PG 下伪装成 401「未认证」）；② `Dict` schema + TEXT 列漏 `json.dumps`（PG 下 500 `expected str, got dict`）；③ JSON 字段 round-trip。**有效性已反向验证**：人为复原上述两处历史 bug 后，该套用例由 7 passed 变 5 failed，复原后复绿。新增此类写路径时同步补冒烟覆盖。
31. **数据库迁移唯一入口是 SSE `/migrate-stream`** — 同步 `POST /database/migrate` 已于 2026-09-16 下线：它在事件循环主线程直接跑 `migrate_direct`，一次迁移期间整个后端无响应（健康检查/登录/信号全堵死，只能 SIGKILL）。前端只暴露 `migrateDatabaseStream()`；`audit_hook` 的 ROUTE_MAP 对应 `/migrate-stream`。备份落 `./data/backups/migration_{source}_to_{target}_{ts}.zip`，保留最近 10 份（`_cleanup_old_backups`）。
32. **迁移期间全局写锁** — `maintenance._migration_lock`：迁移运行时所有写请求（POST/PUT/DELETE/PATCH）统一 503；`GET /database/running-tasks` 把 `running`/`pending`/`interrupted` 视为进行中。前端只做 UX 层拦截（提示 + 阻止二次启动），不要在前后端造第二套并发控制。注意：迁移期间登录（写操作）也会被锁住/挂起，排查用只读端点与预先取得的 token。
33. **SSE 收尾绝不能写在生成器体内** — 客户端断开时 starlette 经 anyio cancel scope 向生成器注入 `CancelledError`（BaseException），会击穿 `except ClientDisconnect` / `except Exception`；生成器 `finally` 里只允许同步操作（如置位 `asyncio.Event`）。需要"等后台线程 + 清状态 + 写库"的收尾必须放独立任务（迁移的 `_finalize_migration`，经 `_spawn_migration_bg_task` 持强引用防 GC），generator 只负责流式输出。同理：生成器 streaming 循环**之后**的代码在断连时永不执行（2026-09-15 实测：刷新页面导致迁移锁永久卡死 + 历史记录丢失；回归测试 `tests/test_migration_stream_api.py`）。另：`run_migration()` 必须显式 `return` `migrate_direct` 的返回值（generator 用 `migration_task.result()` 取 `table_details`；漏 return 则 `complete` 事件永不发送、UI 永远卡在"迁移中"——这是曾被重构丢掉的回归点）；post-copy 操作（`_reset_sequences`/`_sync_schema_with_models`）已包 try/except 且改为后台非阻塞执行——`_reset_sequences` 对远端 PG 会**挂起**，try/except 只兜异常、兜不住挂起。
34. **未知 `/api` 路径由兜底路由返回 JSON 404** — `app/main.py` 的 `/api/{rest:path}`（注册在全部 API 路由之后、SPA 静态挂载之前）。背景：SPA 挂在 `/` 上，此前未匹配的 API 路径 GET 会返回 200 + index.html（写错路径的测试会**假通过**，2026-09-16 一次暴露两个）、非 GET 返回 405。新增路由若"明明存在却 404"，先查是否被该兜底或静态挂载先匹配。
35. **验证代码路径是否执行：用文件探针，别信日志** — uvicorn `--reload` 可能静默服务旧代码（reloader 父进程存活、子进程跑旧码），开发环境 stdout/`logger.warning` 也不可靠（级别/缓冲/热重载）。排查时核对"进程启动时间 vs 文件 mtime"，并在被测代码里直接写文件落探针。
36. **后台进程要 `setsid` 全脱离** — 从 agent shell 用 `nohup` 启动的进程会随会话结束被进程组 SIGKILL（需 `setsid ... &`，stdin 重定向 `< /dev/null`）。另：事件循环被阻塞时 uvicorn 收不到 SIGTERM（信号只在 loop 回到控制流时处理），此时只有 SIGKILL 有效。
37. **审计钩子机制** — 审计走 router 级依赖 `audit_start`（**不是中间件**：路由匹配后执行，`path_params` 可用）；骨架经 `request.state.audit` 传给业务 handler 在同事务内 enrich；`before_flush` 事件提供默认 detail 模板。"骨架 + 显式 `log_audit`"在 flush 期合并**要求两者同事务**（handler 先 commit 就合不了）。`ROUTE_MAP` 显式映射 + 词汇推断双策略覆盖 160+ 路由；`validate_route_map` 只报"既无映射也无法推断"的 mutating 路由（启动告警），**不报过期条目**（删路由时要手动清 ROUTE_MAP）。审计权限键是 `audit_logs`（复数，对齐 `clusters`/`routes`；`system_audit` 是过时术语）。
38. **Node 任务域规则**（设计详见 `docs/design/node-task-center.md`）— ① 脚本传输走 SSH + base64 管道（`echo {b64} | base64 -d | bash`），不用 SCP；② `cmd` 与 `script_file` 互斥在 API + Service 双层校验（有意冗余），前端提交 `script_content` 保证"执行内容 = 编辑区内容"；③ 上传脚本按 UUID 存 `task-scripts/{upload_id}.sh`，原始文件名绝不进存储路径，仅用于前端展示；④ 分发文件落地名 = `destpath + 原始文件名`（service 取 basename 防穿越，API 层拒绝含路径分隔符）；⑤ `distribute_file` 批量分发调 `run_playbook("", "edge_master_copy_to_slaves", ev)` —— **空 ip 字符串是"用 extravars['ips'] 多主机"的信号**，勿改成单 IP 覆盖；⑥ 全局端点（不带 cluster_id）：`POST /node-tasks/upload-script`、`GET /node-tasks/uploaded-scripts`、`DELETE /node-tasks/uploaded-scripts/{upload_id}`、`GET /node-tasks/task-files`、`DELETE /node-tasks/task-files/{task_id}/{name}`（后者须注册在 `/{task_id}` 之前避免路径遮蔽）；⑦ "待用上传"与"任务留档"是两个独立入口，kind 过滤按当前任务类型是**用户明确要求保留**的设计（勿以"移除过滤"修 bug）；任务留档删除只清控制端副本，不动节点文件/任务记录/执行日志。⑧ 上传的临时脚本不过期：创建任务时脚本迁移进任务目录、归任务所有，待用文件由用户经列表/删除端点手动清理。
39. **集群备份存储目录层级** — `cluster_backup._BASE_STORAGE_DIR` 用 `os.path.dirname(...)` × **3**（它位于 `services/`，比 `api/v1/` 浅一级）；照搬 ×4 会退到仓库根。守卫测试 `tests/test_cluster_backup_static_path.py`。
40. **Edge 自启动 systemd 用 `Type=forking`** — `ansible_service` 生成的 edge.service 必须 `Type=forking` + `PIDFile` + `ExecStop`/`ExecReload`/`Restart=on-failure`（`bin/edge start` 会 fork nginx），已废弃的 `Type=oneshot` + `RemainAfterExit=yes` 不要回退。注意 `Type=forking` 下 systemd 只跟踪 PIDFile 中的主 PID：该 PID 退出即判服务 stopped，forked 子进程（nginx worker）不会被回收。另：`deployment/panshi-*.service` 是 `Type=simple`，与 edge.service 无关。
41. **前端 AntDV 中文本地化需双管** — 仅 `ConfigProvider :locale="zhCN"`（App.vue）**覆盖不到** DatePicker 面板文字（月份/星期由 dayjs locale 驱动），必须同时 `dayjs.locale('zh-cn')`（`main.ts`）。
42. **后端测试 fixture 选择** — 需直连数据库（超出 app client）用 `isolated_session`；app-client 测试用 `tests/api_helpers.py` 的 `isolated_app_lifespan()`；异步隔离 API 测试用 `async_authed_client`（自动登录注入 Authorization 头）——**裸 `async_isolated_client` 不带鉴权，访问受保护端点会 401**。已知 `tests/test_script_upload.py` teardown 永久挂起（AuthedTestClient 与未释放的 aiosqlite worker），勿在其上做回归。
43. **测试 mock / patch 规则** — 组件测试 mock 必须 URL 感知兜底，不得用 `mockResolvedValueOnce` 调用顺序链，更不得为迁就 mock 删除用户可见功能（如计数徽章）；函数体内 import 的依赖（如 lifespan 内 import 的 `recover_interrupted_tasks`）必须 patch 其**源模块**，patch 导入方命名空间无效。GBK 测试夹具须用较长的真实内容（`charset_normalizer` 会把短 GBK 串误判为 cp949）。**mock/夹具的数据形状必须取自真实后端响应（curl 实测），不得按类型声明或记忆手写**——2026-09-30 实测：恢复向导夹具把 `present_in:[{target_id,target_name}]` 手写成 `locations:['名字']`，「存在位置」标注整列潜伏失效且测试全绿；同类教训：FakeRemote 类远端桩必须复刻真实 shell 输出语义（tar 输出无末尾换行会与后续 `echo` 粘连，多行 indent=2 JSON 的末行才会暴露，单行 JSON 测不出）。**组件测试要断言组件内 `document.querySelector` 类行为时必须 `mount(attachTo: document.body)`**——VTU 默认挂游离树，document 级查询恒为空（2026-10-29 自启动分页条钉位用例实测），用例结束须 `wrapper.unmount()` 清理。
44. **安全策略已知局限（已接受残余风险）** — 命令逐行校验无法拦截 shell 间接执行（变量赋值 + `$cmd`、`eval`、`source`、函数定义）；由运维负责，文档已标注，勿当漏洞重复上报。
45. **SSE 事件格式规格与实现待收敛** — 生产代码发 `data: {type: ...}` 单流事件，主规格 `openspec/specs/migration-progress-stream/spec.md` 描述 `event: progress/complete/error` 命名事件；分歧未收敛，改 SSE 前先确认是以实现为准还是同步修规格。
46. **静态分析清理：工具只出候选，删除须逐项核验** — 工具链 `vulture app`（Python）/ `npx knip`（TS·Vue 未用文件与导出）/ `npx jscpd src ../backend/app`（重复块），均装自国内镜像。**已知系统性误报**（禁止据此删除）：vulture 对事件钩子签名参数（`before_flush(session, flush_context, instances)` 等）；knip 对 `scripts/*.mjs`（CLI 脚本，其中 `manual-screenshots.mjs` 是**现行手册截图产线**，直接写 `docs/user-manual/images/`）、`src/env.d.ts`、`import * as ns` 命名空间导入的模板层消费、双导出/再导出、间接 devDependencies。判定死代码的唯一依据 = **排除定义文件后全仓（含 `.vue` 模板与测试）引用数 0**；报告格式见 `docs/refactoring/static-analysis-2026-09-16.md`。
47. **统计元素/用点禁止"精确匹配 grep"** — 模板里同名类常带附加类，如 `<div class="card group-card">`；`grep -c 'class="card"'` 只匹配精确串，会把它漏掉。2026-09-16 实测教训：据 `grep 'class="card"'` 判定"页面只有 1 处 .card 用点"后删除该页本地 `.card` 覆盖，导致另一处（组级凭据卡片）**静默失去内边距/外边距**并被用户发现。核对共享样式用点须用**前缀匹配**（`grep 'class="card'`）或 DOM/Playwright 实测元素数，改共享 CSS 前后都要按"真实用点全集"复核。
48. **SQLite→PG 切换后严格类型会暴露两类隐式转换，且 deps 的 `except Exception→401` 会把这类错误伪装成"未认证"** — ① **str→Integer**：2026-09-17 事故，audit 骨架 `_extract_resource_id` 把 str 型 path param 直塞 `AuditLog.resource_id`（Integer 列），SQLite 弱类型默默兼容、PG/asyncpg 拒绝绑定 → autoflush 在 get_current_user 的 SELECT 处炸 → 被吞成 401「未认证」（GET 无审计插入所以 200，极具迷惑性）。已修：提取时显式转 int（非数字回退 None）；get_current_user 内部异常现在会记 ERROR 日志。② **dict→TEXT**：同为 2026-09-17，`stream_proxies.timeout/keepalive_pool` 是 Dict schema + TEXT 列但端点漏 `json.dumps`（同文件其他路径有、这两处漏），PG 绑参报 `expected str, got dict` → 500。已修；全仓审计确认其余 JSON→TEXT 点（上游 checks/timeout/keepalive_pool、插件组/全局规则 plugins、路由 vars/plugin_config_ids、SSL ssl_protocols、Edge 导入）均已正确序列化。**新增 TEXT-JSON 列时必须在端点显式序列化（`isinstance(v, dict/list)` 守卫），不能依赖 SQLite 的弱类型包容。排障口诀：POST 401 而 GET 200 时，先查 mutating 路由的审计骨架写入；写库 500 带 asyncpg 类型错误时，先查 Dict/str 是否未转换。**

49. **SSH ControlPath 模板必须让 ssh 收到真实 `%h/%p/%r`（`%%` 双写），否则跨账号复用 ControlMaster master** — ansible ssh 插件会执行 `control_path % dict(directory=...)`（`ansible/plugins/connection/ssh.py:961`），故模板里每个字面量 `%` 须写两遍：`ansible.cfg` / `ANSIBLE_SSH_CONTROL_PATH` 写 `%%h-%%p-%%r` → ssh 收到 `%h-%p-%r` 按主机/用户展开。写成 `%%%%h`（历史 bug）→ ssh 收到 `%%h` 当字面量，**所有连接塌缩到同一个 socket 文件名 `%h-%p-%r`**，于是 target 不同的 host / remote_user 会静默复用**先建立**的那个 master。2026-09-23 事故：中继区域管理 aoh「配置跳板转发」（root 直连）复用了先前 jboss relay 运行留下的 master，命令以 jboss 执行 → `mkdir: 无法创建目录 "/root": 权限不够` → ansible 报 `Failed to create temporary directory`（假象是权限，真因是身份错位）。守卫测试 `tests/test_ansible_service.py::TestSshControlPathEscaping`（断言 cfg 与 `ansible_service.SSH_CONTROL_PATH` 经 `%` 格式化后无 `%%` 且含 `%h/%p/%r`）。排查类似「按 A 配置却以 B 身份生效」先 `ls /tmp/panshi-cp/` 看 socket 名是否含真实主机/用户名。

50. **中继路由快照派生自 `relay_gateways`/`ps_cluster.region_code`/`ps_node`，凡改动这三张表都须重载** — 快照是**进程内**的（`relay_registry`），而同步读取方（`run_playbook` 的跳板注入、`EdgeClient`）只走 `_require_snapshot()` **不判 TTL**，故任何改动都需显式唤醒：端点写操作用 `await relay_registry.refresh_routing()`（提交**之后**调用，避免与审计骨架写锁叠加），并辅以 `main.py` lifespan 里 `_relay_refresh_loop` 的 **30s TTL 兜底**（覆盖导入/还原、切换活动数据库等无端点触发点的改动——换库后旧快照会指向旧库数据）。2026-09-23 实测：给 `demo-cluster` 绑定区域 `aoh` 后，`192.168.0.14` 的节点状态仍直连不重启不生效（集群/节点 CRUD 只改了库、没重载快照）；修复后经 API 绑定即刻生效、解绑即刻回直连。回归 `tests/test_relay_routing.py`（集群/节点 CRUD 各一条 spy 断言 + `_relay_refresh_loop` 周期兜底用例）。排查口诀：改完区域/节点却"没走中继"，先确认库已改（GET 接口）再看快照是否重载。

    另：**绑定/换绑区域只是"改库 + 刷新快照"，不会更新网关机上的节点白名单**（nginx `edge_targets.conf`），必须对该区域执行一次「下发配置」——否则该区域节点经网关访问**一律 403**（`目标不在该局网关白名单，请执行配置下发`），发布/节点任务必失败。2026-09-23 实测：`demo-cluster` 绑 `aoh` 后网关白名单仍是空表（`default ""`，写于绑定之前）→ upstream 发布 403；执行「下发配置」后三节点白名单就位、403 变 404（已放行，404 只是 Edge 根路径无路由）。节点增删同理（改变白名单成员）。前端已在集群保存成功后弹一次「需下发网关配置」引导（`ClusterFormModal.vue::showRegionGuide`，条件 = 区域非空且相对原值变化）。

    **判定「发布/删除是否经中继」看 `results[].route`，别看 `# [中继]` 标记（两者是不同腿）**：发布/删除由 `EdgeClient` 走 **HTTP 腿**（网关 8443 + `X-Edge-Target`）执行，**不含** ansible 的 `# [中继] 经跳板 …` 标记（该标记只出现在 `run_playbook` 的展示 command 里，对应 **SSH 腿**）。逐节点结果的 `route`（`"relay"`/`"direct"`；经中继另带 `relay_via` = 网关基址）由 `edge_sync._mark_route()` 按**该节点实际用的 `EdgeClient` 实例**写入、调用点在请求发起前（**失败节点也带**）；`build_publish_response` 原样透传 `results`。前端据此显示发布日志 `（经中继）`/`（直连）` 与集群卡片路径徽章。另：`403 目标不在该局网关白名单，请执行配置下发` 只在 `relay_target` 非空时产生（`edge_client.py`），故该文案本身就是「**已走中继、只是白名单没下发**」的证据；直连失败报 `Failed to connect to …`/`timed out`（区域被禁用时附「该区域中继已禁用，直连通常不可达」）。**静态资源 zip 发布也走 HTTP 腿**：`cluster_static_resources.publish_static_resource` 用 `EdgeClient.raw_put` 把整个 zip 作为 PUT body 发给 `/edge/panshi/admin_static_resources`（独立于 `edge_sync.publish_resource`，现已同样逐节点输出 `route`）；故网关 nginx `client_max_body_size`（当前部署 **32m**）对 zip 体积设上限，超限经中继返回 **413**（直连无此限制），排障与边界见 `docs/design/relay-gateway.md`。**连接测试与 edge.env 各自成腿、判定独立**：集群连接测试（`POST /clusters/{id}/test`，入口 `CentralList.vue`「统一管理」与 `ClusterList.vue`）已从裸 TCP 直连探测改为 `EdgeClient` 管理面探测（`list_available_plugins`，经中继感知；有 HTTP 响应即 ok，白名单 403 则 not ok 并提示下发配置），走 **HTTP 腿**、结果带 `route`/`relay_via`，故中继专用区域不再假失败；edge.env 的**发布与读取**走 **SSH 腿**（ansible），同样带 `route`/`relay_via`（同文件 `_node_route_fields`，判定在发起 ansible **之前**取）。两腿判定独立：**同一节点（典型是网关机本机）可能在连接测试显示「经中继」、在 edge.env 读取显示「直连」**（后者命中 SSH 自跳守卫），属正确行为。**HTTP 腿解析为集群上下文优先（2026-11-13，commit 61fca15e）**：`EdgeClient._apply_relay` 在 `cluster_id>0` 时一律按**集群挂接区域**路由（`route_for_cluster`），全局 ip→区域 映射的同 IP 异区域 AMBIGUOUS 歧义**不再误伤**发布/删除/连接测试/edge.env 探测/静态资源/漂移检测/Edge 导入等带集群上下文的调用（实测事故：test 与 test-2 共用节点 192.168.0.13/14/15 却分挂 qqq/bj，发布恒直连）；歧义防护保留给无集群上下文路径（Edge 直连页 `cluster_id=0`，仍按 IP 解析回退直连）；**SSH 腿（ansible 跳板注入）仍按 IP 映射解析**，两腿在歧义 IP 上可能一边中继一边直连，属设计内不对称。直连且原因可解释时逐节点结果带 `route_state`（`disabled`/`ambiguous`）+ `route_detail`（中文明细），前端 `routeLabel(route, r)` 内联渲染如 `直连·区域 luju 已禁用`（未挂区域等常态不带，向后兼容）；快照构建发现歧义 IP 打 WARNING（补齐 docstring 承诺的告警）。

51. **逐节点进度日志（发布/删除）在仓库有多份重复实现，改一处不够；验收必须落在用户实际操作的页面** — 同一句「节点同步结果」由**共享实现**（`useClusterUtils.ts` 的 `executePublish` / `executeDeleteWithProgress`，覆盖路由/上游/插件组/全局规则/SSL/流代理/DNS/节点/集群）与**视图内联实现**（`StaticResourceList.vue`、`StreamProxyList.vue`、`DnsUdpProxyList.vue` 的发布循环；`PluginMetadata.vue` 的删除循环）分别渲染，`useClusterStaticResources.ts` 另有一份（集群子页 Tab 用）。2026-09 教训：给发布日志加「经中继」标注时只改了 composable，用户在侧边栏「静态资源」页**完全看不到**——根因是**验收只核了 API 返回字段 + composable 单测，没核真实页面的渲染路径**。规则：① 改这类日志的标注/格式前，先 `grep -rn 'addLog'` + `grep -rn 'handleResult:'` 把实现点列全；② 验收必须在**用户实际操作的那个页面**上截图确认，组件/API 断言不能替代；③ 同类新增一律往共享入口加，不要再复制一份内联实现；④ **改行为语义时，回归范围必须覆盖同域既有测试**——只跑新写的测试文件会漏掉断言旧语义的既有用例（2026-09 实测：连接测试由裸 TCP 改为 `EdgeClient` 探测后，`tests/test_cluster_test_connection.py` 的 3 个既有用例仍断言旧语义，未跑 `-k "cluster"` 导致红用例随提交带上）；改语义后至少 `pytest -k "<域关键字>"`，涉及跨域共享代码时跑全量。

52. **集群卡片解剖唯一实现 = `components/ClusterCard.vue`** — 集群管理（ClusterList）与统一管理（CentralList 分组/未分组两处）的集群卡片统一渲染该组件（2026-10-04 档位 C 收敛）。契约：props `cluster` + `routeBadge`（`{label, cls} | null`，页面用自家 relay 拉取算好传入，组件内不发请求）+ slots `actions`/`footer`（页面差异经 slot 注入）。**标题条 = 技术身份条（2026-10-26 批 8）：组件恒显「标识 name」（mono 弱色，tooltip 带 ID）+ 区域微章（region_code 非空才渲染）；页面差异经 `topbar-extra` slot（统一管理=最大化，集群管理=留空），旧 `topbar` slot 已删除——页面 SHALL NOT 覆盖身份区**。副标题 = 纯 description（「集群标识: name」回退已移除，避免与身份条重复）。卡片解剖样式（`.cl-card*` 族）只存在于组件内，**禁止在页面重新内联卡片模板或复制其样式**。统一管理页统计格因此从 6 格 @click 最大化改为 7 格 router-link 跳转（与集群管理一致，最大化入口保留在 topbar-extra）。守卫：`ClusterCard.test.ts`（组件级断言身份条/副标题/slot）。
53. **openspec 归档合并的替换块必须取自当下读取的主 spec 现文** — MODIFIED 全块替换与 edit oldString 同理，不得凭记忆/归档样本/上下文压缩重建「原内容」（2026-10-04 两轮实测共 6 处漂移：既有场景集与记忆版完全不同是常态）；同批多份变更改同一需求块时按 created 日期顺序合并，后到者基于前份合并后的文本手工合成单一最终块。openspec CLI 已迁至 **WSL 本机安装**（2026-10-22：nvm node v24 + `@fission-ai/openspec@1.16.0`（2026-11-01 升级，前值 1.13.0），`openspec list`/`validate --all` 秒回；Windows 侧 npm 副本已卸载、不再跨 WSL interop 调用——1.5.0 时代的挂起根因即该边界层，勿再从 `/mnt/c/...` 调起），建档/合并/归档走 CLI 流；主 spec 合入 delta 后跑 `openspec validate --all` 收口（0 error 为准，Purpose 过短 WARNING 可忽略）。（样本格式见 `changes/archive/`）。**MODIFIED 块的场景标题是稳定标识符**（2026-10-27 实测）：场景名集合必须精确覆盖主 spec 现文（缺失即 ERROR `omits scenario(s)`，新增仅提示），openspec 不支持场景级重命名——行为反转时保留原标题、正文改写并 HTML 注释注明裁决来源，勿新增并列场景造成自相矛盾。

54. **全站列表分页统一标准（2026-10-06 收敛，5 项改造落地）** — 有分页 UI 的列表一律 a-table 内置 pagination + `usePagination.paginationProps` 工厂（默认 `PAGE_SIZE_TABLE`=20、选项 10/20/50/100、sizeChanger + 快速跳页 + showTotal「共 X {单位}」），机制默认后端分页（`page`/`page_size`）；后端 `page_size` 上限一律 `MAX_PAGE_SIZE=500`（db_backup/node_tasks 由 100、system 由手动 clamp 200 放宽统一，501 → 422）。合法例外白名单（不纳入统一）：卡片网格全量页（`PAGE_SIZE_CARD_GRID`=500、无 pager）、小表 `:pagination="false"`、metrics Top-N limit。集群子表列表胶水单点在 `useClusterResource.ts` 导出的 `useClusterListCore`（上游/路由/节点共用，节点 keys 为 nodes* 族），**禁止再复制 loadNodes/handleTableChange 同构实现**；组件测试挂 a-table 须用 `__tests__/helpers/aTableStub.ts` 桩（jsdom 无 matchMedia，真实 Table 会 Unhandled Rejection 连挂）。UserList 走真后端分页（users 端点支持 keyword/role/status），**禁回 allUsers+slice 内存切片**——后端默认只回 20 条，切片会让第 21+ 个用户静默消失（本次修复的原始 bug）。**客户端分页列表的行高必须全表一致**（meta 行无条件渲染、空值占位——上游 `|| '-'` 模式）：条件渲染会让每页行高混排不同 → 翻页表格总高漂移 → 分页条跳动（2026-10-29 自启动页实测）。**末页短行的固有单行位移由「分页条钉位」兜底**（自启动页 `onTableChange`：翻页前记分页条视口位置、渲染后 scrollBy 补偿，仅分页条在视口内时生效；2026-10-29 用户确认方案）——别页未接此补偿是有意为之，推广再议，勿当缺陷"修复"。
55. **watchEffect 回调内读取响应式字段 = 把这些字段纳入追踪，副作用会被输入触发** — 2026-10-10 实测（ClusterFormModal）：`watchEffect(() => { if (visible) initForm() })` 的 `initForm` 里新增了读取全部表单字段的快照语句，初始化 effect 因此追踪每个字段 → 用户每敲一个字 effect 重跑、表单被重置回初始值（v-model「打不上字」，症状极具迷惑性：DOM 正常、无报错、submit 时字段全空）。修法：把初始化逻辑放 `watch(source, cb, { immediate: true })`（watch 回调体**不追踪**），或把读取挪到 `nextTick` 等脱离 effect 的上下文。同型陷阱：任何「mount 时执行一次」语义的 watchEffect 内新增读取都会把一次性逻辑变成响应式重触发。
56. **原生 `<select v-model>` 的模型初值/重置必须与占位 option 的 value 精确匹配** — 2026-10-11 实测（插件元数据添加弹窗）：占位写 `<option value="">请选择插件</option>` 而模型初值/重置用 `null`，Vue 的 select 渲染器遍历 option 找值相等者、找不到即 `selectedIndex = -1` → 下拉框整块空白而非显示占位文案（无报错、DOM 正常、常规断言全绿，表象即「下拉框索引错误」）。两种写法各自合法，不变式是**匹配**：`value=""` 占位 → 模型用 `''`；`:value="null"` 占位（如 ClusterBackupDialog）→ 模型用 `null`。新增表单下拉时核对初值与**所有**重置点；守卫用组件测试断言「弹窗打开后占位 option 被选中」（`selectedIndex === 0`，范例见 `PluginMetadataList.test.ts`）。本轮同款修复两文件三处：PluginMetadataList（插件下拉）+ EdgeClient（集群/节点下拉，后者节点下拉在选完集群后会一直空白）。
57. **a-table 自定义空态槽名是 `#emptyText`（不是 `#empty`）** — 2026-10-19 实测：RouteList 空态双形态写了 `#empty`，单测桩（渲染所有槽位）全绿但生产环境从未渲染过；同型潜伏于 NodeList/UpstreamList/UserList（已一并修复），正确范例见 `EdgeClient.vue`。凡"单测绿但页面上看不到"先查桩与真实组件的槽名/结构分歧。另：a-input-search 为回车/放大镜触发，Playwright `fill()` 不会触发 `@search`，E2E 须补 `press('Enter')`。
58. **前端全量单测满并发跑会出现 CPU 争抢型 5s 超时波动** — 失败集合在未改动文件间随机漂移（CentralList/SslGenerateDialog 等轮换）、隔离复跑即绿；全量收口用 `npx vitest run --maxWorkers=4` 稳定全绿（2026-10-19 实测 1704/1704）。定性"波动 vs 回归"先隔离复跑再查代码。**体量升级再实测（2026-11-13，2701 用例）**：连 `--no-file-parallelism` 串行与 `--maxWorkers=4` 都会漂移（连跑 5 轮失败集逐轮轮换 0–3 例、全部未改动文件、隔离全绿，最后 1 轮自然全绿）——失败集逐轮轮换 + 隔离复跑全绿即可定性波动，不必强行凑「全量绿」收口；唯有稳定复现同一文件才是回归。
59. **表格 `#` 序号列解剖全站统一** — 首列 `{ title: '#', key: 'index', width: 45 }`；后端分页表格用跨页连续公式 `(page-1)*pageSize+index+1`，`:pagination="false"`（全量渲染）用 `index+1`；分页绑定无附加逻辑时模板内联调 `usePagination.paginationProps` 工厂（禁本地别名/纯包装 computed）。规范与守卫：`openspec/specs/table-anatomy/spec.md` + `tableAnatomy.source.test.ts`（2026-10-19 收敛，新表格照抄勿再自创宽度/公式）。
60. **集群域 DELETE 端点要求 JSON body** — 删除路由/静态资源等统一收 `DeleteClusterRequest`（`{"delete_db": bool, "delete_edge": bool}`，至少一项 true），裸 DELETE（无 body）返回 422 `Field required` 而非 405/400 语义错误——自动化脚本/验收清理调删除必须带 body，否则静默误判「删除失败」（2026-10-20 实测：静态资源验收脚本 step0 预清理两轮空转）。
61. **新功能总开关必须四层接线，缺一层就是「关了不生效」** — features.yaml 开关的完整门控链：① 后端 API 端点级依赖（敏感/需热生效域用 `Depends(_require_xxx_feature)` 挂 router dependencies，权限在前 403、总闸在后 404，对齐 `database.py::_require_migration_feature`/`relay.py::_require_relay_feature`；静态特性用 main.py 的 `feature_routers` 挂载级）；② 前端路由进 `featureRouteMap` 动态注册（静态注册不受开关控制）；③ 侧边栏菜单项带 `feature` 键（与 `permission` 并列，缺 feature 键则关闸后菜单仍显示）；④ 执行路径读运行时开关（如 `relay_registry.relay_enabled()`）。2026-10-21 实测：中继区域管理只接了④，关闸后菜单/路由/API 全部照常。守卫：`backend/tests/test_relay_feature_gate.py` + `AppSidebar.test.ts` relay 门控用例 + `router/__tests__/index.test.ts`。排查口诀：「开关关了还显示/还能调」先逐层查这四层，别只查执行路径。

62. **跑后端全量测试会杀掉常驻开发服务——已修，但别再引入同类** — `develop/linux/stop.sh` 第 3 步「孤儿清扫」是 `pgrep -f 'uvicorn app\.main:app'` + **项目路径锚点**复核，**完全不看端口**；`tests/test_dev_scripts.py` 若在不设 `PANSHI_PROJECT_ROOT` 的情况下调 stop.sh，锚点就退回真实仓库根 → 把开发机上 12344/12345 的常驻服务一并 SIGKILL（2026-11-01 实测：全量 `uv run pytest` 跑完前后端双双掉线、`/health` 000；单跑该测试文件同样复现 `before=200 → after=000`）。修复：`_script_env()` 默认把锚点隔离到 `tmp_path`（显式传 `project_root=` 的锚点语义用例不受影响），并已实测「14 passed 且 after=200」。**推论**：任何会调用 start/stop 脚本的测试都必须显式隔离 `PANSHI_PROJECT_ROOT` + PID 文件 + 端口三件套，否则它会成为开发环境的隐形杀手；排查「服务莫名其妙没了」先查最近跑过哪些测试。

63. **manual-screenshots.mjs 的 `--only` 是精确匹配** — 截图组名须写全（如 `--only 16-01-dashboard`；传 `16-01` 会静默产出「完成，共 0 张」且退出码 0，极易误判为已重拍）。名称以 `frontend/scripts/manual-screenshots.mjs` 的 SHOTS 清单 `name` 字段为准。

64. **同页并存的头部大数与分布/汇总展示必须同口径** — 指标卡「头部大数」与页面上任何分布/汇总展示若同标签（如「≤10ms 占比」）必须同源同义，否则必被误读（2026-11-03 实锤：快速响应占比头部=最近一桶 100.00% vs 分布条窗口聚合 99.98%）。既定约定（metrics-fast-ratio-card design D13）：头部大数=窗口汇总（`window_ratio`/`window_avg_ms`，全窗口单次舍入）、折线=逐桶趋势（悬停看单桶）；新指标卡头部一律窗口聚合口径，禁止「最近一桶」头部 + 「近 N」scopeLabel 组合；共享卡扩展头值用 `MetricChartCard` 的可选 `headValue` prop（null/缺省回落 data 末点，其他卡零影响）。

65. **product/ 打包脚本受源码守卫测试约束** — `backend/tests/test_product_packaging.py` 钉住 mac 打包链关键防线（2026-11-04 排查 gen-mac.sh「生成失败」确立）：① `product/mac/start.sh` 的 `PRE_PID=$(lsof ...)` 必须带 `|| true`——`set -e` 下目标机端口空闲（首发常态）lsof 退出码 1 会静默杀掉 start.sh，生成的包永远起不来（linux 版有保护、mac 版曾漏）；② gen-mac.sh 第 4 步必须走 `product/tools/install-backend-deps.sh`（uv 缓存/镜像覆盖/离线兜底），禁裸 pip + 硬编码镜像（瞬时网络故障即死，2026-11-03 实锤）；③ ansible collections 本地 tarball 优先（galaxy.ansible.com 国内常不通，tarball 随 backend/ansible/ 已进包）；④ 4.5.1 shebang 修正（包移动后 venv 控制台脚本不失效）；⑤ db_config.json + .jwt_secret 条件随包（建议 34）；⑥ mac 专属必须项不可删（venv `--copies --without-pip` + 手补 `libpython3.11.dylib`、sed 一律 BSD `sed -i ''`）。改 `product/mac/*.sh` 或 gen-linux.sh 同类段落时跑该测试收口。

66. **`backend/.venv/bin` 脚本 shebang 漂移 = 「No module named 'cryptography'」假象** — 2026-11-04 实测：本机 `.venv/bin/` 曾整体携带外项目（test-03）的死路径 shebang，`uv run uvicorn` 命中坏脚本后 shell 经 PATH 兜底到 **Homebrew 全局 Python 3.14 的 uvicorn**（`/opt/homebrew/bin/uvicorn`），全局环境没有项目依赖 → 崩溃循环伪装成「venv 缺包」（实际 site-packages 完好，`uv run --no-sync python -c "import cryptography"` 可证）。排查口诀：backend 起不来报某依赖 ModuleNotFoundError 时，先 `head -1 backend/.venv/bin/uvicorn` 看 shebang 是否指向本项目 venv，再查 `command -v uvicorn` 是否被全局解释器劫持；修复 = 把 `.venv/bin` 脚本 shebang 批量改写为本 venv python 绝对路径（或 `uv sync --reinstall-package <pkg>` 重写入口点）。

67. **默认口令守卫开关 `features.force_default_password_change`（default-password-guard-switch）** — 显式 opt-in **默认关**：`features.py::is_default_password_guard_enabled()` 是唯一读取点（登录标记与 `deps.get_current_user` 拦截同源，勿各自 get_features）。开启后登录时 bcrypt 复核种子默认口令（常量单一定义 `security.py::SEED_DEFAULT_PASSWORD`，seed/守卫/封口共用），命中则 LoginResponse 带 `must_change_password=true` 且 token 嵌 `pwd_chg` claim；带 claim 令牌在白名单（改密/登出/本人权限）外全域 403，`detail` 为结构化 `{"code": "default_password_change_required", "message": ...}`（前端拦截器按 code 派发 `panshi:force-change-password` 事件）。改密收敛靠既有 pwd_ver 吊销（旧 token 401 → 重登），无需清理 claim。**所有设口令路径（建号/管理员重置/自助改密）共享 `validate_password_strength`，一律禁止等于种子默认口令**。自助改密端点 `POST /auth/change-password` 返回新 token+user+permissions，前端须整体换发会话（`stores/auth.applySession`），不得让用户二次登录。前端弹窗 `ForceChangePasswordDialog` 三消费点：Login 强制弹窗（不可关）、App.vue 403 事件兜底（不可关）、顶栏用户菜单一般入口（closable）。#61 四层接线中②③层 N/A（本开关无新路由/菜单，属执行路径行为开关）。开关开启前签发的 token 无 claim 不受拦截，最长 24h 收敛。

68. **裸 `uv run python` 探针会落在真实活动库（conftest 隔离只在 pytest 导入期生效）** — 2026-11-05 实测：为调试审计行直接跑 `uv run python`（import app.main + AuthedTestClient 发请求），因无 conftest 的引擎重定向，读写全部落在 `db_config.json` 活动库（含真实历史数据），污染了 dev 库（探针用户 + 两条审计行 + 误重置 qcg 口令，靠 DB 直连清理恢复）。规则：① 任何绕开 pytest 的脚本探针，先 `print(get_db_url())` 确认落点，非临时库即停；② 需要真实 app 行为验证时一律写成 pytest 用例（自动隔离）或显式 `TEST_DB_BACKEND` 风格重定向；③ 对活动库的一切手工写操作（UPDATE/DELETE）前先 SELECT 复核目标行，写后复核影响行数；④ bcrypt 口令一旦覆盖不可逆，重置他人账号前必须确认原口令已知可恢复。

69. **漂移检测基线语义与类型注册表（config-drift-detection）** — `ps_config_version.edge_payload` 存**实发 Edge 载荷**（publish_resource 落快照时留痕），是漂移检测的唯一合法基线：检测「平台当时真正发过什么 vs Edge 现在是什么」，与 pending_publish（平台待发布）语义正交，勿混用。对比是**基线驱动**：基线字段缺失/不等才报；**空容器基线 + Edge 非空 → 报漂移**（真实事故：插件参数 `{} → {"a":"a"}` 被逐键走漏——空基线代表「平台发送的就是空」，此处出现内容不是默认展开）；非空基线的 Edge 独有字段仍按默认展开忽略——勿改成对称 diff。**多节点语义（2026-11-05 真实事故二）**：采集全部活跃节点做路径级对照——全节点同路径同值差异 = Edge 确定性展开（过滤不报，如 log_process 空插件被 lua 补默认）；仅部分节点出现或各节点值不同 = 真旁路（reason 归因节点）；单节点集群无对照不过滤（如实上报）；资源级缺失（Edge 删整资源）恒报不过滤。类型注册表在 `services/drift_detection.py::DRIFT_TYPE_REGISTRY`（清单 = publish_resource 调用方枚举，grep 钉定；DNS 代理与四层代理共用 stream_proxy 快照类型）；**Edge 对部分类型存储时会重排载荷**：plugin_metadata 展平 `{plugin_name, config_data}` 信封、ssl 把 private_key 改名 key——各类型 normalize 钩子按真实抓形维护（#43），新增类型先抓 GET 实测形态。自管理字段白名单（id/时间戳/etcd 索引）**不含 "key"**（SSL 私钥列同名，走 mask 脱敏，mask 优先于 whitelist）。存量旧快照无 edge_payload → 检测降级「无法评估·基线缺失」，不是缺陷；重新发布即建基线。检测走 EdgeClient HTTP 腿（中继感知），采集在 to_thread（事件循环纯度 #190）。**测试桩注意**：patch `_collect_edge_lists_for_node` 的桩必须返回 `_parse_entries()` 后的形态（`{match_id, value}`）且 `_entry(id, value)` 的 value 是必填位置参数——漏传会被采集层吞成「节点不可达」，症状极具迷惑性。

70. **中继网关清单已界面化（relay-gateway-inventory-ui）** — `backend/ansible/inventory/gateways` 从手工维护文件改为**派生成品**：`relay_gateways` 表新增 ssh_user/ssh_password/ssh_port/ansible_python_interpreter/ssh_common_args 五列（DB 明文，对齐 #10；口令不出列表，编辑/单查走 `GET /relay/gateways/{id}/credential` 且单独写审计 view_credential）。中继区域管理 CRUD 保存即 `gateways_inventory_service.render_and_write()` 整组重写清单（原子写 + 0600 + 备份 `gateways.bak.<ts>` 保留 10 份），**勿再手工编辑该文件**——下次任何网关保存都会覆盖手改。渲染的孤儿分组保留排除本次操作 code（否则删除网关的分组会被当孤儿永久保留、新建同名无法收编——实现过一版无 exclude 的被测试翻出）。存量迁移 `migrate_gateways_file()` 在 lifespan 早期幂等执行（头标注判定，IP+用户回填，匹配不上的分组原样保留并经 `GET /relay/gateways/inventory-status` 暴露）。conftest 会话级夹具把 `gis.GATEWAYS_PATH` 重定向到 tmp（lifespan 迁移不触碰真实凭据文件），专项测试用例内 monkeypatch 覆盖。relay_sshd 临时注入机制不变：渲染只来自 DB 行、天然不含 `# panshi-injected` 临时行。测试 payload 注意：relay 域既有 POST /gateways 用例必须带 `ssh_user`（schema 必填，漏带 422）。

71. **会话间隔后恢复工作，先 `git log --oneline -10` + `git status` 盘点再动手** — 本仓库多会话并行常态下，后台 subagent 派发与恢复之间可能隔数天，同名变更可能已被另一会话完整交付（2026-10-31→11-09 实测：db-backup-dr-ux-optimization 派发两 lane 后会话中断一周，另一会话已实施+E2E+手册+归档并推送，恢复的两个 lane 险些重复实现——前端 lane 自查发现撤手，后端 lane 已写 4 个测试文件才被叫停）。规则：① subagent 收到完成通知或恢复派发前，主会话先核对 HEAD 与远端（`git status -sb` 看 ahead/behind），确认任务是否已被并行交付；② subagent 开工第一步必须是盘点现场（git log/status + 读目标文件现状），发现实现已存在即停手转核验；③ 已交付时，重复劳动的清理原则：误写文件逐 diff 判定「重复→还原 / 修正→保留并说明判据」，不盲目 checkout。

72. **`exclude_unset` 部分更新端点的前端载荷：字段缺席 = 保留旧值，条件拼接必留残值** — 后端 PUT 更新（如 `cluster_routes.py::update_route` 的 `model_dump(exclude_unset=True)`）只更新请求体里**显式出现**的字段；前端表单按开关条件拼载荷（`if (enabled) data.vars = ...`）会把「关闭」误表达成「未变更」，旧值残留库中，再经回填逻辑（如「vars 存在即视为开启」）把开关复活（2026-11-10 实测：路由管理 RouteFormModal 取消高级匹配后旧条件残留，统一管理侧 useClusterRoutes 因恒带 `vars` 而幸免）。规则：直发 PUT 的表单，布尔/列表字段一律**无条件进载荷**，「关闭即清空」语义在载荷层表达（关闭时 `[]`/`false`）；守卫用例见 `RouteFormModal.test.ts` B2（enable_websocket 同型历史 bug）与 E（高级匹配）。

73. **全站搜索框统一 `components/SearchInput.vue`（2026-11-11 UX 收敛）** — 形态：放大镜**恒在右**、单色 `var(--muted)`，有输入时原位换成清空按钮（全站 allow-clear 语义）；样式单一来源 `src/style.css` 的 `.search-input-wrap` / `.search-icon` / `.search-clear`（`views/ssl-page-shared.css` 只留页面宽度，不再覆写图标）。契约：`v-model`（字符串）+ 事件 `input(value)` / `search(value)`（回车）/ `clear`；宽度 `:width="240|'100%'"`（不传沿用全局 200px→聚焦 240px），紧凑工具条 `size="small"`（26px，替代 antd `size="small"`），`data-test` 透传到内层 `input`。**禁止**页面内联手写 `.search-input-wrap`、禁止 emoji 🔍、禁止 `<a-input-search>`（右侧灰色按钮式=第三种造型，且 `fill()` 不触发 `@search`）；守卫 `components/__tests__/SearchInput.source.test.ts`（三条源码红线）+ `SearchInput.test.ts`（行为）。消费方清单：`grep -rl '<SearchInput' src --include=*.vue`（当前 24 文件）。

74. **模板里写了 `<ClusterSelect>` 就必须 import** — 漏 import 时 Vue 把未解析组件渲染成空自定义元素：控件**静默消失**、其 `style="width:…"` 变成隐形占位把整行推右（视觉上的「整行居中」假象），而 `vue-tsc -b` 与组件单测**都抓不到**（2026-11-11 实测：`EdgeAutostart.vue` 换装漏 import，用户报「分组和集群下拉框没了」）。守卫 `components/__tests__/ClusterSelect.consumers.source.test.ts`（扫描全部 .vue 模板区）。同类「用了未 import 的共享组件」一律补源码守卫，别指望类型检查。

75. **原生控件换装 a-select 族必须核对宽度语义** — antd 的 `.ant-select` 是 `inline-block` + `width:auto`，宽度跟随已选文本：选短名（如 jd）后控件收缩、弹出层默认同宽（`dropdownMatchSelectWidth` 默认 true）→ 不可读；而原生 `<select class="form-input">` 自带 `width:100%`，换装丢类即丢宽度（2026-11-12 实测：集群选择统一换装后添加上游弹窗集群下拉缩成内容宽、长名+分组缩进截断）。规则：共享选择控件自带布局默认值（`ClusterSelect.vue` 的 `.cluster-select{width:100%}` + `:dropdown-match-select-width="false"`，守卫 `ClusterSelect.test.ts` 源码钉住）；antd-vue 4.x 只有 `dropdownMatchSelectWidth`（无 antd 5 的 `popupMatchSelectWidth` 改名）；jsdom 不注入 SFC 样式，宽度行为断言走源码守卫范式。

76. **ClusterSelect（值先于事件）消费方的 `@change` 禁止与 v-model 状态做去重比较** — ClusterSelect 契约是 `update:modelValue` 先行、`change` 后到：`@change` 到达时 v-model 已更新为新值，任何「`next === selectedXxx` 则 early-return」的守卫恒真 → 加载副作用永不触发；dirty 确认取消的「`:value` 回弹」也随之失效（v-model 已先行，取消需显式回弹到已加载集群）。2026-11-12 实测：EdgeEnv 换装后选集群恒不加载节点（`/clusters/{id}/nodes` 请求根本不发、API 正常，纯前端守卫吞掉 change）。排查口诀：换装后「选了没反应」而 API 手调正常，先查 `@change` 处理器是否拿 v-model 已更新值做比较；全站清扫确认仅 EdgeEnv 一处此模式。**EdgeEnv 已统一为全站同构模式**：`:value="activeClusterId"` 受控（显示值=已加载集群，取消切换=不动它，结构性回滚零代码）+ `@change` 只做「dirty 确认 → 重载」，无 v-model、无去重守卫、无回弹赋值——源码守卫 `EdgeEnv.test.ts` 末尾 describe 钉住（禁 v-model / 必须 `:value="activeClusterId"` / 处理器禁 `if (next === …) return`）；改动 EdgeEnv 集群切换逻辑时勿退回 v-model + 去重。

## 新增功能步骤

1. 在 `backend/app/schemas/` 定义 Pydantic 模型
2. 在 `backend/app/models/` 定义 SQLAlchemy 模型
3. 在 `backend/app/api/v1/` 添加路由（集群域资源用 `cluster_` 前缀；仅复杂逻辑才加 `services/`）
4. 在 `frontend/src/api/` 添加资源模块，再按需加 composable 和页面

## Git 规则

以 `.gitignore` 为唯一事实源，提交前先 `git status` 确认。要点：

**不入库**（已由 .gitignore 覆盖，不要 force-add）：
- `backend/data/` 全部内容（数据库、静态资源、归档）— 没有任何 .db 文件被跟踪
- `uv.lock`（`backend/uv.lock` 为历史遗留的已跟踪文件；新 lock 文件不提交）
- `logs/`、`*.png`、`product/`、`docs/other/`、`test-results/`
- `backend/ansible/soft/`、`backend/ansible/collections/`、`backend/bin/`
- AI 工具缓存：`.playwright-mcp/`、`.history/`、`.omo/`、`.sisyphus/`、`.cortexkit/`
- 运行时输出：`backend/uvicorn.err|out`、`session-*.md`、`backend/data/static/`、`backend/data/archives/`

**继续正常提交**：
- `openspec/`（全部变更工件）
- `docs/edge/*.log`（既有 API 示例文件）
- `.opencode/skills/` 和 `.opencode/command/`（AI 工具配置）

**依赖声明**：新增后端依赖 → `backend/pyproject.toml`（不是 requirements.txt）；新增前端依赖 → `frontend/package.json`。

## 快速检查清单

- [ ] 验证链路直接连 localhost:12344/12345，勿自行启停服务（服务常驻）
- [ ] 登录表单包含 `id="username"` 和 `id="password"`
- [ ] 代码无 `as any` / `@ts-ignore` / `@ts-expect-error`（测试文件豁免）
- [ ] 依赖写入正确的 manifest（pyproject.toml / package.json）
- [ ] 提交前 `git status` 确认，不 force-add 忽略文件（尤其 `backend/data/`）
- [ ] 本文件与代码冲突时，已按代码修正本文件
