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

**日志位置**：应用日志 `backend/logs/app.log`（level=WARNING）；uvicorn 访问/stdout `backend.log`、前端 `frontend.log`（仓库根，start.sh 重定向）。E2E spec 内直接调 API 用前缀 `/api/v1`（勿用 `/api`），且须先登录取 token 带 `Authorization` 头（2026-08-29 起全部要求鉴权）。

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
15. **禁止使用子代理（task/explorer/fixer 等）** — 当前模型对子代理有限制，会话频繁报错。所有侦察、实现、审查一律由主代理直接完成。
16. **新功能/缺陷修复走 TDD** — 先写失败测试（RED）并验证失败，最小实现（GREEN）验证通过，再重构；openspec 变更的 `tasks.md` 逐项打勾推进。
17. **集群 JSON 备份/导入为 clone-only 单向语义** — 丢弃全部平台 ID、由库分配新 ID、FK 经插入期捕获的旧→新映射重建（主键全库唯一，保号导入必撞车；`stream_proxies.ref_node_id` 随 nodes 重映射；Node 表无 name 字段，备份/还原以 `ip+service_port` 为节点身份键）。导入总是新建未发布集群（status=1，需手动发布）；目标名须过 NAME_PATTERN 且查重先于任何写库。整库还原走"数据库管理"功能，勿造保号模式。
18. **发布/版本/回滚编排单实现** — `edge_sync.publish_resource()` / `list_config_versions()` / `delete_config_version()` 是所有集群域资源的唯一实现，资源差异用参数表达（post_version_hook、prefer_display_name、日志字段），禁止逐资源复制。`backend/tests/test_publish_response.py` 是**源码模式守卫测试**（正则检查 publish 函数体），把响应构建/版本返回搬离原位时必须同步更新该守卫。
19. **权限与审计统一方案** — 全部 API 端点必须挂鉴权/权限依赖，两种形态并存：`APIRouter()` 声明处 `dependencies=[Depends(get_current_user)]`（`cluster_*.py` 等），或端点函数参数 `Depends(require_permission(resource))`（`database.py`、`ansible_inventory.py`、`cluster_backup.py`、`clusters.py` 根端点等）；仅 system/features 与 /health 有意公开。资源级门控用 `deps.py` 的 `require_permission(resource)` / `require_any_permission(*resources)` 工厂（admin 直通；`cluster_*` 子资源由 clusters 容器权限门控）。**新增/修改路由必须在 `tests/test_security_guard.py` 的 UNAUTHENTICATED_SAMPLES 补采样**（2026-09 教训：采样漏掉 `/clusters` 根路径导致 5 端点匿名可访问）。**新增可路由资源须双端注册权限键**（后端门控 + 前端权限 keys，对齐左侧菜单分类，见 `user-management-ui`）。操作审计走 `services/audit.py` 的 `log_audit`（写 sys_audit_log），查询端 `GET /system/operations`（管理员）。认证流式端点必须 fetch 流式带 Authorization 头（原生 EventSource 不能加 header）。后端鉴权测试复用 `tests/api_helpers.py`（AuthedTestClient，seed admin id=1）。
20. **JWT 密钥解析链**（`app/core/security.py`）— 显式 `JWT_SECRET_KEY` 环境变量 → `.env.<APP_ENV>` 中非占位值 → `APP_ENV=production` 无配置即启动失败 → 开发自动生成并持久化 `backend/data/.jwt_secret`。注意：该 key 同时是 `db_config.py` 的 **Fernet 密钥**（数据库连接密码加密），换 key 会使已存密码不可解。
21. **Ansible 执行两条铁律** — ① `run_playbook` 必须显式传 `inventory=<inventory/host 文件>`（ansible-runner 对 inventory/ 目录是递归扫描，遗留 .bak 会被当主机源解析报 "Invalid host pattern 'all:'"）；备份统一在 `inventory/backups/`。② rc=0 ≠ 执行成功：ansible 对空匹配（节点不在清单，'no hosts matched'）以 rc=0 退出，判定前必须扫描输出标记——false-success 守卫见 `node_task_service._ansible_false_success_error` 与 cluster_edge_env 部署/读取流。
22. **Edge 网关 URI 透传，不做裸路径兼容** — APISIX 类 radixtree 下 `X/*` 不匹配裸 `X`（只匹配 `X/` 及子路径），WebSocket 客户端须连带斜杠的 `/ws/`；`convert_route_to_edge_format` 仅透传 uri，补兼容曾评估后**决定不做**（用户决策）。
23. **字段名错位仅两处，序列化按 mapper 读列名** — `SslCertificate.private_key` 对应 DB 列 `key`（`_serialize` 输出 dict 键用 `attr.columns[0].name`、取值用 `attr.key`）；`StreamProxy.timeout` 列型为 TEXT（备份保字符串原样如 `"15"`）。其余模型名一致。
24. **前端 CRUD 一律基于工厂** — `useClusterResourceCore.ts` 是删除/发布/版本/选择十件套的唯一实现（selection 访问器参数化）；分页资源用 `useClusterResource`，插件实体（plugin_configs/global_rules）用 `useClusterPluginEntity`——两者是薄适配层。`VersionModalState` 单定义于 core、两文件重导出。新资源 composable 禁止复制删除/发布/版本逻辑。
25. **弹窗三层制** — 普通确认/信息 → `useOverlayModal`（showOverlayModal，手写 modal-overlay，全站 Modal.confirm 已清零）；删除/发布进度等共享流程 → AppModal（`components/AppModal.vue` + useClusterUtils 的 5 个共享弹窗）；视图级内联弹窗保持手写 modal-overlay。例外：EdgeImport/UserList/AnsibleInventory 三页保留 a-modal（品牌色头部）。教训：Vue 属性内多语句 `a; b` 会被 prettier 重排破坏编译——须提取为函数调用。
26. **日期/文件大小格式化只用 `utils/format.ts`** — formatDate（dash）/formatDateTime（slash 含秒）/formatMonthDayTime/formatDateOnly/formatPublishDateTime(Asia/Shanghai)/formatFileSize；禁止视图内再写本地 formatDate（Phase 1 已消除 12 处重复）。**后端时间列一律 `datetime.utcnow` 存储（naive UTC，isoformat 无时区后缀），前端展示必须走 utils/format.ts——其 `parseBackendDate` 将无后缀字符串按 UTC 解析、按 Asia/Shanghai 展示；禁止视图内 `new Date(t).toLocaleString()` 直读后端时间**（2026-09 教训：naive UTC 被当本地时间解析，全站时间显示少 8 小时）。模板内需要全角空格 U+3000 时写实体 `&#x3000;`（prettier 会破坏裸字符及注释位置）。
27. **前端工程化管线** — ESLint 10 flat config（vue3-essential + typescript-eslint；`no-explicit-any`/`no-unused-vars` 为 warn 级）、Prettier（无分号/单引号/120 宽）、husky 9 + lint-staged（`.husky` 在 frontend/，已配 `core.hooksPath`；pre-commit 自动 fix 暂存文件）。`types/index.ts` 中动态 JSON 的 `Record<string, any>` 为有意豁免（带 eslint-disable 注释）；`.vue` 模板层 ~474 处存量 any warn 走增量治理，**不开专项清理**（全量回归 UI 的 ROI 为负）。
28. **数据库归档/导出代码必须双方言感知（SQLite/PostgreSQL）** — `db_archive_service` 归档的 `ddl/` 成件是 best-effort 元数据（仅 SQLite 源提取 sqlite_master DDL，非 SQLite 源返回空串，全仓库无消费方，导入不依赖）；PG 源经 psycopg2 裸 `text()` 查询返回 `datetime`/`Decimal` **对象**（SQLite 返回字符串，测试因此测不出），行序列化必须走 `_serialize_row`（`default=str`）。守卫测试 `backend/tests/test_db_archive_service.py`（TestGetDdlDialectGate/TestSerializeRow）；真 PG 回归用 `PG_DSN` 环境变量 opt-in（`test_sqlite_to_pg_migration.py` 同款模式）。2026-09 教训：PG 源导出曾在第一张表即报 `relation "sqlite_master" does not exist`。
29. **端点让 service 自建会话写库时必须贯穿 `get_db` 会话** — audit 钩子（路由级依赖）在 `get_db` 会话 A 上 add 审计骨架，`get_current_user` 随后在 A 上 SELECT 触发 **autoflush → A 持 SQLite 写锁直到请求结束**；若 handler 里 service 再开第二会话写库（如曾 `NodeTaskService.retry_task` 内 `_reset_failed_items` 自建会话），会被阻塞至 busy_timeout → `database is locked` → 500。修复：端点注入 `db: Depends(get_db)` 并作为参数贯穿 service（`retry_task(task_id, node_ids, db=db)`）。带 `db` 参数的端点（create/delete 等）不受影响。守卫测试 `TestRetrySessionThreading`（文件库双引擎复现自锁）。另：async engine 未挂 `_configure_sqlite_connection`（无 busy_timeout/WAL/FK pragma），后续可评估补齐。
30. **测试套件治理基线** — pytest 已配 `--timeout=90`（pyproject）；`tests/api_helpers.py` 的 `isolated_app_lifespan()` 用于隔离 lifespan 真实库/后台服务交互；`_no_edge_http` 模式（autouse mock EdgeClient 网络）杜绝测试真实网络 IO。45 个文件仍绑定真实库（迁移立项 `openspec/changes/test-suite-db-isolation`），全量审计见 `docs/refactoring/test-suite-consolidation-2026-09-12.md`。禁新增：`assert callable/hasattr` 型零价值用例、跨文件复制同行为用例（单字段变体一律 parametrize）。
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
43. **测试 mock / patch 规则** — 组件测试 mock 必须 URL 感知兜底，不得用 `mockResolvedValueOnce` 调用顺序链，更不得为迁就 mock 删除用户可见功能（如计数徽章）；函数体内 import 的依赖（如 lifespan 内 import 的 `recover_interrupted_tasks`）必须 patch 其**源模块**，patch 导入方命名空间无效。GBK 测试夹具须用较长的真实内容（`charset_normalizer` 会把短 GBK 串误判为 cp949）。
44. **安全策略已知局限（已接受残余风险）** — 命令逐行校验无法拦截 shell 间接执行（变量赋值 + `$cmd`、`eval`、`source`、函数定义）；由运维负责，文档已标注，勿当漏洞重复上报。
45. **SSE 事件格式规格与实现待收敛** — 生产代码发 `data: {type: ...}` 单流事件，主规格 `openspec/specs/migration-progress-stream/spec.md` 描述 `event: progress/complete/error` 命名事件；分歧未收敛，改 SSE 前先确认是以实现为准还是同步修规格。

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
